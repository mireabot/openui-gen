import type { ReactNode, SelectHTMLAttributes } from "react";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import styles from "@/app/how-to/how-to.module.css";

const SOURCE_ROOT = "https://github.com/mireabot/openui-gen/blob/adf8f9e/";

export function GuideSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <span className={styles.selectControl}><select {...props} /><CaretDownIcon size={12} weight="bold" /></span>;
}

/** A link to a line of the repo at `at`, a commit; guides default to the one they were written from. */
export function Source({ file, line, at, children }: { file: string; line: number; at?: string; children: ReactNode }) {
  return <a className={styles.sourceLink} href={`${at ? SOURCE_ROOT.replace(/blob\/[^/]+\/$/, `blob/${at}/`) : SOURCE_ROOT}${file}#L${line}`} target="_blank" rel="noreferrer">{children} ↗</a>;
}
