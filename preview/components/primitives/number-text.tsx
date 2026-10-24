"use client";
import NumberFlow from "@number-flow/react";

const ROLL = { duration: 200, easing: "cubic-bezier(0.77, 0, 0.175, 1)" };
const FADE = { duration: 125, easing: "cubic-bezier(0.23, 1, 0.32, 1)" };
/** A formatted number with optional trailing prose. Other text is rendered unchanged. */
export function NumberText({ text, animated = true }: { text: string; animated?: boolean }) {
  const match = /^([+−-]?)(\$?)([\d,]+(?:\.\d+)?)(%?)(\s.*)?$/.exec(text);
  if (!match) return <>{text}</>;
  const decimals = match[3]!.split(".")[1]?.length ?? 0;
  return <><NumberFlow value={Number(match[3]!.replaceAll(",", ""))} prefix={`${match[1]}${match[2]}`} suffix={match[4] || undefined} locales="en-US" format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }} animated={animated} respectMotionPreference transformTiming={ROLL} spinTiming={ROLL} opacityTiming={FADE} className="tabular-nums" />{match[5]}</>;
}
