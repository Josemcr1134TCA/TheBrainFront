// Black-box tests of the «sin permisos» page (route /sin-permiso), design EP00-TBR-005 §8 and approved UI
// docs/ui/EP00-TBR-005/ (propuesta.md §3, §5, §6; PA-1 and PA-3, approved by the PO with adjustments on 2026-11-13).
// [EP00-TBR-005-CA5] The design system EmptyState in its «sin permisos» variant (lock, role="status") inside a card,
//                    with only the title «Tu perfil no puede ver esta pantalla»: no description, no action, no code.
//                    It does not read the data mode (PA-3).
// Contract assumed for T3: class AccessDeniedPage, standalone, in ./access-denied.page.ts.
// Written before the code (T1). Synthetic data only.
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of } from 'rxjs';
import { Screen } from '../model/screen';
import { SignInRequest } from '../model/session';
import { AccessStore } from '../data/access.store';
import { IdentityGrantDto, IdentityPort } from '../data/identity.port';
import { ScreenCatalogPort } from '../data/screen-catalog.port';
import { AccessDeniedPage } from './access-denied.page';

const TITLE = 'Tu perfil no puede ver esta pantalla';
const CODE_WORDS = /\b(UNAVAILABLE|FORBIDDEN|NOT_FOUND|VALIDATION|INVALID_CURSOR|NO_VIEW|UNKNOWN_SCREEN|NO_SESSION|ACTION_NOT_GRANTED)\b/;

const GRANT: IdentityGrantDto = {
  user: { id: 'user-test-1', displayName: 'Usuario de prueba 1' },
  profile: { id: 'profile-test-1', name: 'Perfil de prueba 1', synthetic: true },
  grants: [],
};

class FakeIdentityPort extends IdentityPort {
  restore(): Observable<IdentityGrantDto | null> {
    return of(null);
  }
  signIn(_request: SignInRequest): Observable<IdentityGrantDto> {
    return of(GRANT);
  }
  signOut(): Observable<void> {
    return of(undefined);
  }
}

class FakeScreenCatalogPort extends ScreenCatalogPort {
  screens(): Observable<readonly Screen[]> {
    return of([]);
  }
}

// No DATA_MODE is provided on purpose: the page must not need it (PA-3).
function render() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: IdentityPort, useValue: new FakeIdentityPort() },
      { provide: ScreenCatalogPort, useValue: new FakeScreenCatalogPort() },
    ],
  });
  return () => {
    const fixture = TestBed.createComponent(AccessDeniedPage);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
}

const flat = (el: HTMLElement) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('[EP00-TBR-005-CA5] AccessDeniedPage («sin permisos»)', () => {
  it('[EP00-TBR-005-CA5] shows the EmptyState «sin permisos» (lock) with role="status"', () => {
    const el = render()();

    const empty = el.querySelector('.tb-empty') as HTMLElement | null;
    expect(empty).not.toBeNull();
    expect(empty?.classList.contains('lock')).toBe(true);
    expect(empty?.getAttribute('role')).toBe('status');
  });

  it('[EP00-TBR-005-CA5] its only text is the approved title (PA-1)', () => {
    const el = render()();

    expect(flat(el)).toBe(TITLE);
    expect((el.querySelector('.tb-empty b') as HTMLElement | null)?.textContent?.trim()).toBe(TITLE);
  });

  it('[EP00-TBR-005-CA5] has no description, no reference and no action (PA-1, PA-3)', () => {
    const el = render()();

    expect(el.querySelectorAll('.tb-empty p')).toHaveLength(0);
    expect(el.querySelectorAll('button')).toHaveLength(0);
    expect(el.querySelectorAll('a')).toHaveLength(0);
    expect(flat(el)).not.toMatch(/Referencia|Pide acceso|equipo técnico/);
    expect(flat(el)).not.toMatch(CODE_WORDS);
  });

  it('[EP00-TBR-005-CA5] the EmptyState sits inside a card (approved layout)', () => {
    const el = render()();

    expect(el.querySelector('.tb-card .tb-empty')).not.toBeNull();
  });

  it('[EP00-TBR-005-CA5] is the same with or without a session (it does not depend on the mode or the profile)', async () => {
    const create = render();
    const withoutSession = flat(create());

    const store = TestBed.inject(AccessStore);
    await new Promise<void>((done) =>
      store.signIn({ kind: 'demo', profileId: GRANT.profile.id }).subscribe({ complete: () => done(), error: () => done() }),
    );
    const withSession = flat(create());

    expect(withoutSession).toBe(TITLE);
    expect(withSession).toBe(TITLE);
  });
});
