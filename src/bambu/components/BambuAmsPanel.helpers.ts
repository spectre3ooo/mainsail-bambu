/**
 * Pure helper functions extracted from BambuAmsPanel so they can be
 * unit-tested without mounting the full Vue/Vuetify component tree.
 */

export interface BambuMmuMachineUnitLike {
    name: string
    num_gates: number
    first_gate: number
    // Helpers don't need `vendor`, but the real `BambuMmuMachineUnit` carries
    // it and tests pass realistic fixtures including it. Declared optional so
    // TS's excess-property check on object literals doesn't complain.
    vendor?: string
}

export interface BambuNativeAmsUnitLike {
    id: number
    name: string
    humidity_percent: number
    humidity_raw: number
    temperature_c: number
    dry_time_seconds: number
    bound_extruder_id?: number
}

export interface BambuNativeAmsViewColumn {
    extruder_id: number
    label: string
    units: BambuNativeAmsUnitLike[]
    external: {
        id: number
        material?: string
        color_hex?: string
        empty?: boolean
    } | null
    currently_routed: boolean
}

export interface BambuNativeAmsView {
    columns: BambuNativeAmsViewColumn[]
    fts_installed: boolean
    fila_switch_raw: Record<string, unknown> | null
    cfs_raw: number[]
}

/**
 * Find the mmu_machine unit index for an external spool attached to the
 * given nozzle side. Prefers per-side naming ("Ext L" / "Ext R") emitted
 * on H2D dual-external hardware; falls back to the plain "Ext" name used
 * when only one external is present.
 *
 * @param units      - The ordered list of mmu_machine units.
 * @param preferred  - The side-specific name to try first (e.g. "Ext L" or "Ext R").
 * @returns Index into `units`, or -1 if no matching external unit was found.
 */
export function findExternalMmuUnitIndex(
    units: BambuMmuMachineUnitLike[],
    preferred: string
): number {
    const exact = units.findIndex((u) => u.name === preferred)
    if (exact >= 0) return exact
    return units.findIndex((u) => u.name === 'Ext' || u.name.toLowerCase() === 'ext')
}

/**
 * Return the preferred external-unit name for a given nozzle index.
 * extruder 1 (left/DEPUTY) → "Ext L";  extruder 0 (right/MAIN) → "Ext R".
 */
export function preferredExternalName(nozzleIndex: number): string {
    return nozzleIndex === 1 ? 'Ext L' : 'Ext R'
}
