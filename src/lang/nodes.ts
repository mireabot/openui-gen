/**
 * A flat primitive tree: an evaluated OpenUI program as id-keyed nodes. The server uses it to
 * check a program renders, derive skeleton frames and read what each part shows.
 */

export type Value =
  | string | number | boolean | null
  | readonly Value[]
  | { readonly [key: string]: Value }
  | { readonly $data: string };

export interface PNode {
  readonly id: string;
  readonly primitive: string;
  readonly props: Readonly<Record<string, Value>>;
  /** Child ids per node/nodes argument, in order. */
  readonly children: Readonly<Record<string, readonly string[]>>;
  readonly line: number;
  readonly itemOf: string | null;
}

export interface Placement {
  readonly children: readonly string[];
  readonly where: "screen";
  readonly anchor: null;
  /** "page" (default) or "sheet". */
  readonly presentation?: "page" | "sheet";
  /** "light" (default) or "dark". */
  readonly appearance?: "light" | "dark";
}

export interface ProgramTree {
  readonly placement: Placement;
  readonly nodes: readonly PNode[];
}
