export interface SharedProps {
  x: number;
  y: number;
  height: number;
  width: number;
}
export interface Node {
  type: string;
  props: SharedProps & Record<string, any>;
}
export type Scene = Node[];

export const Adapt = {
  isValidScene: (scene: unknown): scene is Scene => {
    return !!scene && Array.isArray(scene);
  },
};
