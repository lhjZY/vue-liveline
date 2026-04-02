declare module 'vue-liveline' {
  import type { DefineComponent } from 'vue'

  export interface LivelinePoint {
    time: number
    value: number
  }

  export interface LivelineSeries {
    id: string
    data: LivelinePoint[]
    value: number
    color: string
    label?: string
  }

  export const Liveline: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export const LivelineComponent: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
}
