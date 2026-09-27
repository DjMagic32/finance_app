import { MD3LightTheme } from 'react-native-paper';

export const Semaforo = {
  verde: '#2E7D32',
  amarillo: '#F9A825',
  rojo: '#C62828',
} as const;

export const AppColors = {
  primary: '#1565C0',
  ingreso: '#2E7D32',
  gasto: '#C62828',
  fondo: '#F5F7FA',
} as const;

export const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: AppColors.primary,
    background: AppColors.fondo,
  },
};
