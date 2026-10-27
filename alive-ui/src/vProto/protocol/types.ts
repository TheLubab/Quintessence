export type Props = Record<string, string>;

export type Op =
  | { t: 'add'; kind: string; id: string; props: Props }
  | { t: 'set'; id: string; props: Props }
  | { t: 'del'; id: string };

export interface Node {
  id: string;
  kind: string;
  props: Props;
  parent: string | null;
  children: string[];
}

export type Patch =
  | { t: 'create'; node: Node }
  | { t: 'update'; node: Node; changed?: string[] }
  | { t: 'remove'; id: string; removed: string[] };

export const parentOf = (id: string): string | null => {
  const i = id.lastIndexOf('.');
  return i === -1 ? null : id.slice(0, i);
};
