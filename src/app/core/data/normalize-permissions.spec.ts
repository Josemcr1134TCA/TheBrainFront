// Black-box tests of the pure permission normalization (design EP00-TBR-005 §5; decisions X1, X3, DA-4).
// [EP00-TBR-005-CA1] Permissions by screen and action: a screen with only view can be viewed, not captured or approved.
// [EP00-TBR-005-CA2] View is a prerequisite (R-0002, broad reading X1): every action other than view, including future
//                    ones, is dropped when the same screen has no view. The function only restricts: it never adds a
//                    permission. Inactive or unknown screens are dropped; actions are deduplicated; the result is frozen.
// Written before the code (T1), from the story, the design and the decisions. Synthetic data only.
import { ActionCode, Actions } from '../model/action';
import { EffectivePermissions } from '../model/permission';
import { ScreenCode } from '../model/screen';
import { IdentityGrantDto } from './identity.port';
import { normalizePermissions } from './normalize-permissions';

type Grants = IdentityGrantDto['grants'];

const code = (value: string) => value as ScreenCode;
const action = (value: string) => value as ActionCode;

const A = code('sample.test.a');
const B = code('sample.test.b');
const C = code('sample.test.c');
const INACTIVE = code('sample.test.inactive');
const ACTIVE = new Set<ScreenCode>([A, B, C]);

const actionsOf = (result: EffectivePermissions, screen: ScreenCode): string[] => [...(result.get(screen) ?? [])].sort();
const has = (result: EffectivePermissions, screen: ScreenCode, act: string) => result.get(screen)?.has(action(act)) ?? false;

describe('[EP00-TBR-005-CA1] model constants', () => {
  it('[EP00-TBR-005-CA1] Actions exposes the three confirmed actions with their codes', () => {
    expect(Actions.VIEW).toBe('view');
    expect(Actions.CAPTURE).toBe('capture');
    expect(Actions.APPROVE).toBe('approve');
  });
});

describe('[EP00-TBR-005-CA1] normalizePermissions: permissions by screen and action', () => {
  it('[EP00-TBR-005-CA1] a screen with only view keeps view and has neither capture nor approve', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view'] }], ACTIVE);

    expect(has(result, A, 'view')).toBe(true);
    expect(has(result, A, 'capture')).toBe(false);
    expect(has(result, A, 'approve')).toBe(false);
  });

  it('[EP00-TBR-005-CA1] permissions are per screen: view on one screen grants nothing on another', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view', 'capture', 'approve'] }], ACTIVE);

    expect(actionsOf(result, A)).toEqual(['approve', 'capture', 'view']);
    expect(actionsOf(result, B)).toEqual([]);
    expect(has(result, B, 'view')).toBe(false);
  });

  it('[EP00-TBR-005-CA1] keeps view, capture and approve when the screen has the three', () => {
    const result = normalizePermissions([{ screen: B, actions: ['approve', 'view', 'capture'] }], ACTIVE);

    expect(actionsOf(result, B)).toEqual(['approve', 'capture', 'view']);
  });

  it('[EP00-TBR-005-CA1] no grants gives no permissions at all', () => {
    const result = normalizePermissions([], ACTIVE);

    for (const screen of ACTIVE) expect(actionsOf(result, screen)).toEqual([]);
  });

  it('[EP00-TBR-005-CA1] the same screen listed twice joins its actions (it never loses view for being split)', () => {
    const result = normalizePermissions(
      [
        { screen: A, actions: ['view'] },
        { screen: A, actions: ['capture'] },
      ],
      ACTIVE,
    );

    expect(actionsOf(result, A)).toEqual(['capture', 'view']);
  });
});

describe('[EP00-TBR-005-CA2] normalizePermissions: view is a prerequisite (R-0002, X1)', () => {
  it('[EP00-TBR-005-CA2] capture without view on a screen is dropped', () => {
    const result = normalizePermissions([{ screen: A, actions: ['capture'] }], ACTIVE);

    expect(has(result, A, 'capture')).toBe(false);
    expect(has(result, A, 'view')).toBe(false);
    expect(actionsOf(result, A)).toEqual([]);
  });

  it('[EP00-TBR-005-CA2] approve without view on a screen is dropped', () => {
    const result = normalizePermissions([{ screen: A, actions: ['approve'] }], ACTIVE);

    expect(actionsOf(result, A)).toEqual([]);
  });

  it('[EP00-TBR-005-CA2] capture and approve with view are kept (having them implies having view)', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view', 'capture', 'approve'] }], ACTIVE);

    for (const act of ['capture', 'approve']) {
      expect(has(result, A, act)).toBe(true);
      expect(has(result, A, 'view')).toBe(true);
    }
  });

  it('[EP00-TBR-005-CA2] removing view from a screen removes every other action there, and only there', () => {
    const before = normalizePermissions(
      [
        { screen: A, actions: ['view', 'capture', 'approve'] },
        { screen: B, actions: ['view', 'capture'] },
      ],
      ACTIVE,
    );
    const after = normalizePermissions(
      [
        { screen: A, actions: ['capture', 'approve'] },
        { screen: B, actions: ['view', 'capture'] },
      ],
      ACTIVE,
    );

    expect(actionsOf(before, A)).toEqual(['approve', 'capture', 'view']);
    expect(actionsOf(after, A)).toEqual([]);
    expect(actionsOf(after, B)).toEqual(['capture', 'view']);
  });

  it('[EP00-TBR-005-CA2] a future action (assign) without view is dropped too (broad reading X1)', () => {
    const result = normalizePermissions([{ screen: A, actions: ['assign'] }], ACTIVE);

    expect(has(result, A, 'assign')).toBe(false);
    expect(actionsOf(result, A)).toEqual([]);
  });

  it('[EP00-TBR-005-CA2] a future action (assign) with view is kept: the action type is extensible', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view', 'assign'] }], ACTIVE);

    expect(has(result, A, 'assign')).toBe(true);
    expect(actionsOf(result, A)).toEqual(['assign', 'view']);
  });

  it('[EP00-TBR-005-CA2] view is matched exactly: «VIEW» or « view» is not view, so the other actions go away', () => {
    const result = normalizePermissions(
      [
        { screen: A, actions: ['VIEW', 'capture'] },
        { screen: B, actions: [' view', 'approve'] },
      ],
      ACTIVE,
    );

    expect(has(result, A, 'capture')).toBe(false);
    expect(has(result, A, 'view')).toBe(false);
    expect(has(result, B, 'approve')).toBe(false);
    expect(has(result, B, 'view')).toBe(false);
  });
});

describe('[EP00-TBR-005-CA2] normalizePermissions: only restricts, fails closed', () => {
  it('[EP00-TBR-005-CA2] a screen that is not active (inactive or unknown) is dropped with all its actions', () => {
    const unknown = code('sample.test.unknown');
    const result = normalizePermissions(
      [
        { screen: INACTIVE, actions: ['view', 'capture'] },
        { screen: unknown, actions: ['view'] },
        { screen: A, actions: ['view'] },
      ],
      ACTIVE,
    );

    expect(result.has(INACTIVE)).toBe(false);
    expect(result.has(unknown)).toBe(false);
    expect([...result.keys()]).toEqual([A]);
  });

  it('[EP00-TBR-005-CA2] with no active screens nothing is granted', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view', 'capture', 'approve'] }], new Set<ScreenCode>());

    expect(result.size).toBe(0);
  });

  it('[EP00-TBR-005-CA2] duplicated actions are deduplicated', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view', 'view', 'capture', 'capture'] }], ACTIVE);

    expect(actionsOf(result, A)).toEqual(['capture', 'view']);
    expect(result.get(A)?.size).toBe(2);
  });

  it('[EP00-TBR-005-CA2] the result never holds an action or a screen that the grants did not bring', () => {
    const grants: Grants = [
      { screen: A, actions: ['view'] },
      { screen: B, actions: ['capture'] },
    ];
    const result = normalizePermissions(grants, ACTIVE);

    for (const [screen, actions] of result) {
      const granted = grants.filter((g) => g.screen === screen).flatMap((g) => g.actions);
      for (const act of actions) expect(granted).toContain(act);
    }
    expect(has(result, C, 'view')).toBe(false);
  });

  it('[EP00-TBR-005-CA2] does not mutate its inputs', () => {
    const grants = [
      { screen: A, actions: ['capture', 'capture'] },
      { screen: INACTIVE, actions: ['view'] },
    ];
    const snapshot = JSON.stringify(grants);
    const active = new Set<ScreenCode>([A]);

    normalizePermissions(grants, active);

    expect(JSON.stringify(grants)).toBe(snapshot);
    expect([...active]).toEqual([A]);
  });

  it('[EP00-TBR-005-CA2] the result is frozen: trying to add a screen or an action has no effect', () => {
    const result = normalizePermissions([{ screen: A, actions: ['view'] }], ACTIVE);

    try {
      (result as unknown as Map<ScreenCode, Set<ActionCode>>).set(B, new Set([action('view')]));
    } catch {
      /* a frozen structure may throw: that is fine */
    }
    try {
      (result.get(A) as unknown as Set<ActionCode>).add(action('approve'));
    } catch {
      /* idem */
    }
    try {
      (result as unknown as Map<ScreenCode, Set<ActionCode>>).delete(A);
    } catch {
      /* idem */
    }

    expect(result.has(B)).toBe(false);
    expect(has(result, A, 'approve')).toBe(false);
    expect(has(result, A, 'view')).toBe(true);
  });
});
