export interface Profile {
  readonly id: string;
  readonly name: string;
  /** True for every demonstration profile: it never represents a real role. */
  readonly synthetic: boolean;
}
