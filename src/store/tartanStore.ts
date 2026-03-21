import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { WeaveType } from '../core/weaves';
import type { GeneratorResult } from '../core/types';

export interface TartanConfig {
  batchSize: number;
  colorMin: number;
  colorMax: number;
  stripeMin: number;
  stripeMax: number;
  threadMin: number;
  threadMax: number;
  totalMin: number;
  totalMax: number;
  threadGauge: number;
  weaveType: WeaveType;
  symmetry: 'symmetric' | 'asymmetric' | 'either';
}

export interface GeneratedTartan {
  id: string;
  result: GeneratorResult;
  parentId?: string;
}

export interface CustomColor {
  code: string;
  name: string;
  hex: string;
}

interface TartanState {
  // Generator config
  config: TartanConfig;
  setConfig: (partial: Partial<TartanConfig>) => void;

  // Generated patterns
  generatedTartans: GeneratedTartan[];
  setGeneratedTartans: (tartans: GeneratedTartan[]) => void;
  addTartan: (tartan: GeneratedTartan) => void;
  removeTartan: (id: string) => void;

  // Custom colors
  customColors: CustomColor[];
  addCustomColor: (color: CustomColor) => void;
  removeCustomColor: (code: string) => void;
}

export const useTartanStore = create<TartanState>()(
  immer((set) => ({
    config: {
      batchSize: 6,
      colorMin: 3,
      colorMax: 6,
      stripeMin: 3,
      stripeMax: 8,
      threadMin: 4,
      threadMax: 24,
      totalMin: 100,
      totalMax: 400,
      threadGauge: 24,
      weaveType: 'twill-2-2' as WeaveType,
      symmetry: 'symmetric',
    },

    setConfig: (partial) =>
      set((state) => {
        Object.assign(state.config, partial);
      }),

    generatedTartans: [],

    setGeneratedTartans: (tartans) =>
      set((state) => {
        state.generatedTartans = tartans;
      }),

    addTartan: (tartan) =>
      set((state) => {
        state.generatedTartans.push(tartan);
      }),

    removeTartan: (id) =>
      set((state) => {
        state.generatedTartans = state.generatedTartans.filter(
          (t) => t.id !== id
        );
      }),

    customColors: [],

    addCustomColor: (color) =>
      set((state) => {
        state.customColors.push(color);
      }),

    removeCustomColor: (code) =>
      set((state) => {
        state.customColors = state.customColors.filter((c) => c.code !== code);
      }),
  }))
);
