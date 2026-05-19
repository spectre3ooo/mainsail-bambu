import { describe, expect, it } from 'vitest'
import {
    findExternalMmuUnitIndex,
    preferredExternalName,
    type BambuMmuMachineUnitLike,
    type BambuNativeAmsView,
} from '@/bambu/components/BambuAmsPanel.helpers'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// Three AMS units: AMS A (gates 0-3, right nozzle), AMS B (gates 4-7, left
// nozzle), AMS HT (gates 8-11, right nozzle), plus side-specific externals.
const makeUnits = (): BambuMmuMachineUnitLike[] => [
    { name: 'AMS A', vendor: 'Bambu', num_gates: 4, first_gate: 0 },
    { name: 'AMS B', vendor: 'Bambu', num_gates: 4, first_gate: 4 },
    { name: 'AMS HT', vendor: 'Bambu', num_gates: 4, first_gate: 8 },
    { name: 'Ext R', vendor: 'Bambu', num_gates: 1, first_gate: 12 },
    { name: 'Ext L', vendor: 'Bambu', num_gates: 1, first_gate: 13 },
]

// A nozzle_view with fts_installed true, mapping:
//   column 0 (right/MAIN)  → AMS A, AMS HT, + external
//   column 1 (left/DEPUTY) → AMS B, + external
const makeNozzleView = (): BambuNativeAmsView => ({
    fts_installed: true,
    fila_switch_raw: null,
    cfs_raw: [],
    columns: [
        {
            extruder_id: 0,
            label: 'Right Nozzle',
            currently_routed: true,
            units: [
                {
                    id: 0,
                    name: 'AMS A',
                    humidity_percent: 2,
                    humidity_raw: 45,
                    temperature_c: 24,
                    dry_time_seconds: 0,
                    bound_extruder_id: 0x0e,
                },
                {
                    id: 128,
                    name: 'AMS HT',
                    humidity_percent: 3,
                    humidity_raw: 60,
                    temperature_c: 26,
                    dry_time_seconds: 3600,
                    bound_extruder_id: 0x0e,
                },
            ],
            external: { id: 12 },
        },
        {
            extruder_id: 1,
            label: 'Left Nozzle',
            currently_routed: false,
            units: [
                {
                    id: 1,
                    name: 'AMS B',
                    humidity_percent: 1,
                    humidity_raw: 30,
                    temperature_c: 22,
                    dry_time_seconds: 0,
                    bound_extruder_id: 0x0e,
                },
            ],
            external: { id: 13 },
        },
    ],
})

// ---------------------------------------------------------------------------
// findExternalMmuUnitIndex
// ---------------------------------------------------------------------------

describe('findExternalMmuUnitIndex', () => {
    it('returns the exact index for "Ext L" when present', () => {
        const units = makeUnits()
        expect(findExternalMmuUnitIndex(units, 'Ext L')).toBe(4)
    })

    it('returns the exact index for "Ext R" when present', () => {
        const units = makeUnits()
        expect(findExternalMmuUnitIndex(units, 'Ext R')).toBe(3)
    })

    it('falls back to plain "Ext" when preferred side name is absent', () => {
        const units: BambuMmuMachineUnitLike[] = [
            { name: 'AMS A', vendor: 'Bambu', num_gates: 4, first_gate: 0 },
            { name: 'Ext', vendor: 'Bambu', num_gates: 1, first_gate: 4 },
        ]
        // Neither "Ext L" nor "Ext R" is present; falls back to "Ext"
        expect(findExternalMmuUnitIndex(units, 'Ext L')).toBe(1)
        expect(findExternalMmuUnitIndex(units, 'Ext R')).toBe(1)
    })

    it('returns -1 when no external unit is present at all', () => {
        const units: BambuMmuMachineUnitLike[] = [
            { name: 'AMS A', vendor: 'Bambu', num_gates: 4, first_gate: 0 },
        ]
        expect(findExternalMmuUnitIndex(units, 'Ext R')).toBe(-1)
    })

    it('matches "ext" case-insensitively as fallback', () => {
        const units: BambuMmuMachineUnitLike[] = [
            { name: 'AMS A', vendor: 'Bambu', num_gates: 4, first_gate: 0 },
            { name: 'EXT', vendor: 'Bambu', num_gates: 1, first_gate: 4 },
        ]
        expect(findExternalMmuUnitIndex(units, 'Ext R')).toBe(1)
    })
})

// ---------------------------------------------------------------------------
// preferredExternalName
// ---------------------------------------------------------------------------

describe('preferredExternalName', () => {
    it('returns "Ext L" for nozzle 1 (left/DEPUTY)', () => {
        expect(preferredExternalName(1)).toBe('Ext L')
    })

    it('returns "Ext R" for nozzle 0 (right/MAIN)', () => {
        expect(preferredExternalName(0)).toBe('Ext R')
    })
})

// ---------------------------------------------------------------------------
// nozzle_view column resolution (pure logic extracted)
// ---------------------------------------------------------------------------

// The component's sourcesFromNozzleView is not a pure function (it calls
// this.buildGates which depends on mmu gate_color state), so we test the
// column-selection and unit-matching logic through the helpers instead.

describe('nozzle_view column resolution', () => {
    const view = makeNozzleView()
    const units = makeUnits()

    it('column for extruder_id 0 contains AMS A and AMS HT', () => {
        const col = view.columns.find((c) => c.extruder_id === 0)!
        expect(col).toBeDefined()
        const names = col.units.map((u) => u.name)
        expect(names).toContain('AMS A')
        expect(names).toContain('AMS HT')
        expect(names).not.toContain('AMS B')
    })

    it('column for extruder_id 1 contains only AMS B', () => {
        const col = view.columns.find((c) => c.extruder_id === 1)!
        expect(col).toBeDefined()
        const names = col.units.map((u) => u.name)
        expect(names).toEqual(['AMS B'])
    })

    it('each column unit can be resolved to a mmu_machine unit by name', () => {
        for (const col of view.columns) {
            for (const nvUnit of col.units) {
                const idx = units.findIndex((u) => u.name === nvUnit.name)
                expect(idx).toBeGreaterThanOrEqual(0)
            }
        }
    })

    it('right column external resolves to "Ext R" (index 3)', () => {
        const col = view.columns.find((c) => c.extruder_id === 0)!
        expect(col.external).not.toBeNull()
        const preferred = preferredExternalName(0) // 'Ext R'
        const idx = findExternalMmuUnitIndex(units, preferred)
        expect(idx).toBe(3)
        expect(units[idx].name).toBe('Ext R')
    })

    it('left column external resolves to "Ext L" (index 4)', () => {
        const col = view.columns.find((c) => c.extruder_id === 1)!
        expect(col.external).not.toBeNull()
        const preferred = preferredExternalName(1) // 'Ext L'
        const idx = findExternalMmuUnitIndex(units, preferred)
        expect(idx).toBe(4)
        expect(units[idx].name).toBe('Ext L')
    })

    it('missing column (no matching extruder_id) returns undefined', () => {
        const col = view.columns.find((c) => c.extruder_id === 99)
        expect(col).toBeUndefined()
    })
})
