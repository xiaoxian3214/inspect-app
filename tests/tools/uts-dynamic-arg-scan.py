#!/usr/bin/env python3
"""扫描 HBuilderX 生成的 Kotlin，找出「动态值被传入强类型形参」的位置。

Android 端 UTS 会转译成 Kotlin：动态值（Any?）传给 String/Number/UTSJSONObject 等
具体类型形参时，HBuilderX 类型检查器与 kotlinc 都会报「参数类型不匹配」。
本脚本按三个高信号来源定位动态变量：
  1. for (x in resolveUTSValueIterator(...)) 的循环变量
  2. 未标注类型的 lambda 形参（fun(x){ / fun(x): T {）
  3. val x = ...?.get("...") / [..] 取得的值
然后检查这些名字是否被直接当作实参传给已声明具体类型形参的函数。

用法：python3 tests/tools/uts-dynamic-arg-scan.py [目录或 .kt 文件 ...]
"""
import re
import sys
from pathlib import Path

CONCRETE = re.compile(
    r"^(String|Number|Boolean|UTSJSONObject|UTSArray<|Map<|Set<|UTSPromise<|UniInputEvent|UniTouchEvent|[A-Z]\w*)\??$"
)
DYNAMIC_NAMES = {"Any", "Any?"}


def parse_functions(text):
    """收集函数签名：名字 -> 形参类型列表。返回类型为 Any 的一并记录。"""
    functions = {}
    for match in re.finditer(r"fun\s+(?:gen_([A-Za-z_$][\w$]*)|([A-Za-z_$][\w$]*))\s*\(([^)]*)\)\s*(?::\s*([^\{]+))?\{", text):
        name = match.group(1) or match.group(2)
        params_raw = match.group(3)
        types = []
        for param in split_top_level(params_raw):
            decl = param.split("=")[0].strip()
            if ":" in decl:
                types.append(decl.split(":", 1)[1].strip())
            elif decl:
                types.append("Any")
        functions.setdefault(name, types)
    return functions


def split_top_level(text):
    parts, depth, current = [], 0, ""
    for char in text:
        if char in "([<{":
            depth += 1
        elif char in ")]>}":
            depth -= 1
        if char == "," and depth == 0:
            parts.append(current)
            current = ""
            continue
        current += char
    if current.strip():
        parts.append(current)
    return [part for part in parts if part.strip()]


def split_args(text):
    """按顶层逗号拆分调用实参。"""
    return split_top_level(text)


def collect_dynamic_names(text):
    """收集动态变量：名字 -> (来源说明, 声明位置)。"""
    names = {}
    for match in re.finditer(r"for\s*\(\s*([A-Za-z_$][\w$]*)\s+in\s+resolveUTSValueIterator", text):
        names[match.group(1)] = ("迭代动态集合", match.start())
    for match in re.finditer(r"fun\s*\(\s*([A-Za-z_$][\w$]*)\s*\)", text):
        names[match.group(1)] = ("未标注 lamdba 形参", match.start())
    for match in re.finditer(r"fun\s*\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)", text):
        names[match.group(2)] = ("未标注 lambda 形参", match.start())
    for match in re.finditer(r"val\s+([A-Za-z_$][\w$]*)\s*=\s*[^\n=]*\?\.get\(", text):
        names.setdefault(match.group(1), ("动态 get 取值", match.start()))
    for match in re.finditer(r"val\s+([A-Za-z_$][\w$]*)\s*=\s*[^\n]*\?\.get\(", text):
        names.setdefault(match.group(1), ("动态 get 取值", match.start()))
    return names


def scan_file(path, functions, findings):
    text = path.read_text()
    dynamic = collect_dynamic_names(text)
    if not dynamic:
        return
    for match in re.finditer(r"(?<![\w.$])([A-Za-z_$][\w$]*)\s*\(", text):
        callee = match.group(1)
        # 跳过函数声明本身，它形如 fun name( 或 fun gen_name(，不是调用
        prefix = text[max(0, match.start() - 5):match.start()]
        if prefix.endswith(("fun ", "fun gen_")) or text[max(0, match.start() - 2):match.start()] == "::":
            continue
        types = functions.get(callee)
        if types is None:
            continue
        start = match.end() - 1
        depth, end = 0, start
        for index in range(start, len(text)):
            if text[index] == "(":
                depth += 1
            elif text[index] == ")":
                depth -= 1
                if depth == 0:
                    end = index
                    break
        args = split_args(text[start + 1:end])
        line = text[:match.start()].count("\n") + 1
        for position, arg in enumerate(args):
            if position >= len(types):
                break
            expected = types[position]
            if expected in DYNAMIC_NAMES or not CONCRETE.match(expected):
                continue
            stripped = arg.strip()
            dynamic_hit = None
            for name, (origin, declared_at) in dynamic.items():
                # 只在变量声明附近（同一函数体窗口内）才认定，避免同名形参误报
                if match.start() - declared_at > 1500 or match.start() < declared_at:
                    continue
                if re.search(rf"(?<![\w.$]){re.escape(name)}(?![\w$])", stripped):
                    dynamic_hit = f"{name}({origin})"
                    break
            if dynamic_hit is None and "?.get(" in stripped:
                dynamic_hit = "动态 get 取值"
            if stripped.startswith('"') or stripped.startswith("_uO(") or stripped.startswith("_uM("):
                dynamic_hit = None
            if re.match(r"^[A-Za-z_$][\w$]*\s*:", stripped):
                dynamic_hit = None
            if dynamic_hit is not None:
                findings.append((str(path), line, callee, expected, stripped[:90], dynamic_hit))


def main():
    targets = []
    for raw in sys.argv[1:] or ["unpackage/cache/.app-android/src"]:
        path = Path(raw)
        if path.is_dir():
            targets.extend(path.rglob("*.kt"))
        elif path.exists():
            targets.append(path)
    findings = []
    for target in sorted(targets):
        text = target.read_text()
        scan_file(target, parse_functions(text), findings)
    for path, line, callee, expected, arg, origin in findings:
        short = path.split("/src/")[-1]
        print(f"{short}:{line} {callee}(…) 第 {expected} 类型实参 <- {origin}\n    实参: {arg}")
    print(f"\n合计 {len(findings)} 处待人工确认")


if __name__ == "__main__":
    main()