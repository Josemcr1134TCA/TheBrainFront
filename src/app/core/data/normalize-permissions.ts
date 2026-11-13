import { ActionCode, actionCode, Actions } from '../model/action';
import { EffectivePermissions } from '../model/permission';
import { ScreenCode, screenCode } from '../model/screen';
import { IdentityGrantDto } from './identity.port';

const READ_ONLY = 'Los permisos efectivos son de solo lectura.';

class FrozenMap<K, V> extends Map<K, V> {
  constructor(entries: Iterable<readonly [K, V]>) {
    super();
    for (const [key, value] of entries) Map.prototype.set.call(this, key, value);
    Object.freeze(this);
  }
  override set(): this {
    throw new TypeError(READ_ONLY);
  }
  override delete(): boolean {
    throw new TypeError(READ_ONLY);
  }
  override clear(): void {
    throw new TypeError(READ_ONLY);
  }
}

class FrozenSet<T> extends Set<T> {
  constructor(values: Iterable<T>) {
    super();
    for (const value of values) Set.prototype.add.call(this, value);
    Object.freeze(this);
  }
  override add(): this {
    throw new TypeError(READ_ONLY);
  }
  override delete(): boolean {
    throw new TypeError(READ_ONLY);
  }
  override clear(): void {
    throw new TypeError(READ_ONLY);
  }
}

/**
 * Sanitizes the grants that arrive, failing closed (R-0002, broad reading X1; applied always, X3). It only restricts, it
 * never adds: it drops screens that are not active, removes duplicate actions and drops every action other than "view"
 * on a screen that has no "view" (including future actions).
 */
export function normalizePermissions(
  grants: IdentityGrantDto['grants'],
  activeScreens: ReadonlySet<ScreenCode>,
): EffectivePermissions {
  const merged = new Map<ScreenCode, Set<ActionCode>>();
  for (const grant of grants) {
    const code = screenCode(grant.screen);
    if (!activeScreens.has(code)) continue;
    const actions = merged.get(code) ?? new Set<ActionCode>();
    for (const action of grant.actions) actions.add(actionCode(action));
    merged.set(code, actions);
  }

  const result: [ScreenCode, ReadonlySet<ActionCode>][] = [];
  for (const [code, actions] of merged) {
    if (!actions.has(Actions.VIEW)) continue;
    result.push([code, new FrozenSet(actions)]);
  }
  return new FrozenMap(result);
}
