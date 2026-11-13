import { Profile } from '../model/profile';
import { IdentityGrantDto } from './identity.port';

export interface DemoProfileSeed {
  readonly profile: Profile;
  /** RAW grants, before normalization: some are inconsistent on purpose to exercise it. */
  readonly grants: IdentityGrantDto['grants'];
}

const ALL = ['view', 'capture', 'approve'];

/**
 * Eight synthetic profiles (S10): none is an official role. "Sistemas" is the only one with every permission over the
 * sample screens. Only profile 8 has no "view" on sample.catalog.01 (the screen guarding /catalogo).
 */
export const DEMO_PROFILE_SEEDS: readonly DemoProfileSeed[] = [
  {
    profile: { id: 'demo-1', name: 'Sistemas', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ALL },
      { screen: 'sample.catalog.02', actions: ALL },
      { screen: 'sample.replenishment.01', actions: ALL },
      { screen: 'sample.purchasing.01', actions: ALL },
      { screen: 'sample.inventory.01', actions: ALL },
      { screen: 'sample.commercial.01', actions: ALL },
    ],
  },
  {
    // CA1: only "view" on one screen.
    profile: { id: 'demo-2', name: 'Perfil de demostración 2', synthetic: true },
    grants: [{ screen: 'sample.catalog.01', actions: ['view'] }],
  },
  {
    // CA2: capture and approve WITHOUT view on sample.purchasing.01 in the raw data.
    profile: { id: 'demo-3', name: 'Perfil de demostración 3', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ['view', 'capture'] },
      { screen: 'sample.purchasing.01', actions: ['capture', 'approve'] },
    ],
  },
  {
    profile: { id: 'demo-4', name: 'Perfil de demostración 4', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ['view', 'capture'] },
      { screen: 'sample.replenishment.01', actions: ALL },
    ],
  },
  {
    profile: { id: 'demo-5', name: 'Perfil de demostración 5', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ['view'] },
      { screen: 'sample.inventory.01', actions: ['view', 'capture'] },
    ],
  },
  {
    // Raw grants over an inactive screen: normalization drops it.
    profile: { id: 'demo-6', name: 'Perfil de demostración 6', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ['view'] },
      { screen: 'sample.catalog.02', actions: ['view'] },
      { screen: 'sample.commercial.01', actions: ['view'] },
      { screen: 'sample.commercial.02', actions: ['view', 'capture'] },
    ],
  },
  {
    // Approve without view on sample.catalog.02, and a screen the catalog does not know.
    profile: { id: 'demo-7', name: 'Perfil de demostración 7', synthetic: true },
    grants: [
      { screen: 'sample.catalog.01', actions: ['view'] },
      { screen: 'sample.catalog.02', actions: ['approve'] },
      { screen: 'sample.unknown.99', actions: ['view'] },
    ],
  },
  {
    // No screens at all.
    profile: { id: 'demo-8', name: 'Perfil de demostración 8', synthetic: true },
    grants: [],
  },
];
