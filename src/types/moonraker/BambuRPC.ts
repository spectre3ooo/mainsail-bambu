// Bambu fork: JSON-RPC methods exposed by bambu-raker only.

export interface BambuCalibrationResult {
    result: 'ok'
    detail: string
}

export interface BambuRPC {
    /** Run verified standalone vibration calibration: print.calibration option=4. */
    'printer.calibration.vibration': () => Promise<BambuCalibrationResult>

    /** Select the printer's extrusion calibration entry for an AMS slot. */
    'printer.calibration.extrusion_cali_sel': (params: {
        ams_id: number
        slot_id: number
        filament_id: string
        nozzle_diameter?: string
        cali_idx?: number
    }) => Promise<BambuCalibrationResult>
}
