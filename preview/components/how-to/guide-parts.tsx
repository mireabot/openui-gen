import type { ReactNode, SelectHTMLAttributes } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import styles from "@/app/how-to/how-to.module.css";

const SOURCE_ROOT = "https://github.com/mireabot/openui-gen/blob/adf8f9e/";

export function GuideSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className={styles.selectControl}><select {...props} /><CaretDownIcon size={12} weight="bold" /></span>;
}

export function Source({ file, line, children }: { file: string; line: number; children: ReactNode }) {
  return <a className={styles.sourceLink} href={`${SOURCE_ROOT}${file}#L${line}`} target="_blank" rel="noreferrer">{children} ↗</a>;
}
