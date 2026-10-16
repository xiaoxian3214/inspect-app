#!/usr/bin/env bash
# 用 HBuilderX 自带的 kotlinc 编译「Android 端生成的 Kotlin」，统计三类真实致命错误。
#
# 用法：
#   1) 先在 HBuilderX 里保存文件，等它把 Kotlin 重新转译到
#      unpackage/cache/.app-android/src/（可用 stat 看 mtime 是否更新）
#   2) bash tests/tools/kotlin-verify.sh
#
# 说明：脚本里的 classpath 只含 HBuilderX 运行库，不含 DCloud 的 Kotlin 编译器插件，
# 因此 unresolved reference／cannot infer 一类会有大量“假报错”。
# 只看下面三个计数即可，它们是插件也无法放过的硬错误：
#   explicit-type-required  → Kotlin 形参缺类型（必须为 0）
#   not-enough-information  → 裸 _uA()/Map()/Set() 无法推断泛型实参（必须为 0）
#   type-mismatch-any       → Any 流向具体形参（多为 classpath 假报错，仅作参考）
set -uo pipefail

HX_ROOT="${HX_ROOT:-/Applications/HBuilderX.app/Contents/HBuilderX}"
KOTLINC="${KOTLINC:-$HX_ROOT/plugins/uniapp-runextension/kotlinc/bin/kotlinc}"
export JAVA_HOME="${JAVA_HOME:-$HX_ROOT/plugins/amazon-corretto}"
LIBS="${LIBS:-$HX_ROOT/plugins/uniapp-runextension/lib2}"
KT_SRC="${KT_SRC:-unpackage/cache/.app-android/src}"
LOG="${LOG:-/tmp/kt-verify.log}"

if [ ! -x "$KOTLINC" ]; then
  echo "找不到 kotlinc：$KOTLINC（可用 KOTLINC=... 覆盖）" >&2
  exit 2
fi
if [ ! -d "$KT_SRC" ]; then
  echo "找不到生成的 Kotlin：$KT_SRC（先在 HBuilderX 编译一次）" >&2
  exit 2
fi

find "$KT_SRC" -name '*.kt' | sort > /tmp/kt-verify-files.txt
CP="$(ls "$LIBS"/*.jar | tr '\n' ':')"
echo "编译 $(wc -l < /tmp/kt-verify-files.txt) 个 .kt 文件（classpath: $LIBS）..."

"$KOTLINC" -nowarn -cp "$CP" @/tmp/kt-verify-files.txt -d /tmp/kt-verify-out > "$LOG" 2>&1
echo "kotlinc 退出码：$?（有错时为 1，属正常）"
echo
printf '%-24s %s\n' "explicit-type-required:" "$(grep -c 'an explicit type is required on a value parameter' "$LOG")"
printf '%-24s %s\n' "not-enough-information:" "$(grep -c 'not enough information to infer type argument' "$LOG")"
printf '%-24s %s\n' "type-mismatch-any:" "$(grep -c "argument type mismatch: actual type is 'Any" "$LOG")"
printf '%-24s %s\n' "总 error 数:" "$(grep -c ': error: ' "$LOG")"
echo
echo "按文件列出前两类硬错误："
grep -E ": error: (an explicit type is required|not enough information)" "$LOG" \
  | sed "s|^$KT_SRC/||" | awk -F: '{print $1}' | sort | uniq -c | sort -rn | head -20
echo
echo "完整日志：$LOG"