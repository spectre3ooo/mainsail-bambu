<template>
    <v-dialog v-if="visible" v-model="open" :max-width="520" persistent content-class="bambu-error-dialog">
        <v-card class="bambu-error-card">
            <div class="bambu-error-titlebar">
                <v-icon size="20" color="warning" class="mr-2">{{ mdiAlertCircle }}</v-icon>
                <span class="bambu-error-titlebar__name">Printer error</span>
            </div>
            <v-card-text class="bambu-error-body">
                <p class="bambu-error-message">{{ displayMessage }}</p>
                <p class="bambu-error-code">[{{ formattedCode }}]</p>
                <p v-if="!jobId" class="bambu-error-warning">
                    <v-icon size="14" color="warning">{{ mdiAlertCircleOutline }}</v-icon>
                    Job id not reported yet — action buttons will engage once it arrives.
                </p>
            </v-card-text>
            <v-card-actions class="bambu-error-actions">
                <v-btn
                    block
                    outlined
                    :loading="busyAction === 'ignore'"
                    :disabled="!canAct"
                    @click="onAction('ignore')">
                    Ignore this and Resume
                </v-btn>
                <v-btn
                    block
                    outlined
                    :loading="busyAction === 'resume'"
                    :disabled="!canAct"
                    class="mt-2"
                    @click="onAction('resume')">
                    Problem Solved and Resume
                </v-btn>
                <v-btn
                    block
                    outlined
                    color="error"
                    :loading="busyAction === 'stop'"
                    :disabled="!canAct"
                    class="mt-2"
                    @click="onAction('stop')">
                    Stop print
                </v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import { Component, Mixins } from 'vue-property-decorator'
import BaseMixin from '@/components/mixins/base'
import { mdiAlertCircle, mdiAlertCircleOutline } from '@mdi/js'

interface BambuActiveErrorView {
    print_error: number
    formatted_code: string
    message: string | null
    job_id: string
}

type Action = 'ignore' | 'resume' | 'stop'

const ACTION_PATHS: Record<Action, string> = {
    ignore: '/server/bambu/print/error/ignore_and_resume',
    resume: '/server/bambu/print/error/resume_problem_solved',
    stop: '/server/bambu/print/error/stop',
}

const ACTION_LABELS: Record<Action, string> = {
    ignore: 'Ignore and resume',
    resume: 'Problem solved and resume',
    stop: 'Stop print',
}

@Component
export default class BambuPrintErrorDialog extends Mixins(BaseMixin) {
    mdiAlertCircle = mdiAlertCircle
    mdiAlertCircleOutline = mdiAlertCircleOutline

    busyAction: Action | null = null
    // Tracks `print_error` values the user has already chosen an action
    // on. The firmware keeps reporting the error briefly after we send
    // the resume/ignore command (it acks but propagation lags); the
    // dialog would otherwise pop back open immediately and the user
    // would have to dismiss it again.
    acknowledged: number | null = null

    get view(): BambuActiveErrorView | null {
        const v = (this.$store.state.printer as Record<string, unknown>).bambu_active_error
        return (v as BambuActiveErrorView | undefined) ?? null
    }

    get visible(): boolean {
        if (this.view === null) return false
        if (this.view.print_error === 0) return false
        // Suppress while we wait for the firmware to clear the error
        // after one of our action commands.
        return this.acknowledged !== this.view.print_error
    }

    get open(): boolean {
        return this.visible
    }
    set open(_v: boolean) {
        // Dialog is `persistent` — Vuetify still fires this on backdrop
        // clicks if persistent is dropped. Treat any close as an
        // implicit "acknowledge for now" so the user isn't stuck.
        if (this.view !== null && this.view.print_error !== 0) {
            this.acknowledged = this.view.print_error
        }
    }

    get formattedCode(): string {
        return this.view?.formatted_code ?? ''
    }

    get displayMessage(): string {
        if (this.view?.message) return this.view.message
        if (this.view?.print_error) return `Printer error ${this.view.formatted_code}`
        return ''
    }

    get jobId(): string {
        return this.view?.job_id ?? ''
    }

    get canAct(): boolean {
        return !this.busyAction && !!this.jobId && (this.view?.print_error ?? 0) > 0
    }

    async onAction(action: Action): Promise<void> {
        const v = this.view
        if (v === null || v.print_error <= 0 || !v.job_id) return
        const label = ACTION_LABELS[action]
        this.busyAction = action
        this.$store.dispatch('server/addEvent', {
            message: `${label} (POST ${ACTION_PATHS[action]})`,
            type: 'command',
        })
        try {
            const resp = await fetch(ACTION_PATHS[action], {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ print_error: v.print_error, job_id: v.job_id }),
            })
            if (!resp.ok) {
                const text = await resp.text()
                this.$store.dispatch('server/addEvent', {
                    message: `${label} failed: HTTP ${resp.status} ${text}`,
                    type: 'response',
                })
            } else {
                this.$store.dispatch('server/addEvent', {
                    message: `${label}: accepted`,
                    type: 'response',
                })
                // Hide the dialog until the firmware clears print_error.
                this.acknowledged = v.print_error
            }
        } catch (e) {
            this.$store.dispatch('server/addEvent', {
                message: `${label} error: ${e}`,
                type: 'response',
            })
        } finally {
            this.busyAction = null
        }
    }
}
</script>

<style scoped>
.bambu-error-card {
    background: #2b2b2b;
    color: rgba(255, 255, 255, 0.92);
}

.bambu-error-titlebar {
    display: flex;
    align-items: center;
    height: 38px;
    padding: 0 18px;
    background: #9d8c45;
    color: #fff;
    font-weight: 600;
}

.bambu-error-titlebar__name {
    font-size: 0.95rem;
    letter-spacing: 0.02em;
}

.bambu-error-body {
    padding: 22px 26px 8px !important;
}

.bambu-error-message {
    margin: 0 0 12px;
    font-size: 0.95rem;
    line-height: 1.5;
}

.bambu-error-code {
    margin: 0 0 4px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85rem;
    opacity: 0.65;
}

.bambu-error-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 14px 0 0;
    padding: 8px 10px;
    background: rgba(255, 152, 0, 0.08);
    border: 1px solid rgba(255, 152, 0, 0.32);
    border-radius: 4px;
    font-size: 0.83rem;
}

.bambu-error-actions {
    display: flex;
    flex-direction: column;
    padding: 8px 26px 22px;
}

/* Vuetify's v-card-actions injects `margin-left: 8px` on every child
   after the first (for the standard horizontal-row layout). We stack
   buttons vertically — that extra left margin shifts the 2nd and 3rd
   buttons right relative to the 1st. Zero it out. */
.bambu-error-actions > .v-btn + .v-btn {
    margin-left: 0 !important;
}
</style>
