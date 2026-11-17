import cubes from './tests/cubes.js';
import rotation from './tests/rotation.js';
import attention from './tests/attention.js';
import francais from './tests/francais.js';
import codage from './tests/codage.js';
import { tamicMaths, math1, math3 } from './tests/maths.js';
import cadran from './tests/cadran.js';
import culture from './tests/culture.js';
import orientation from './tests/orientation.js';
import drones from './tests/drones.js';
import vaisseau from './tests/vaisseau.js';
import secpil from './tests/secpil.js';
import t3a from './tests/t3a.js';
import anglais from './tests/anglais.js';

export const SECTIONS = [
  { id: 'tamic', title: 'CSO — TAMIC' },
  { id: 'eopn', title: 'EOPN — Tours' },
  { id: 'anglais', title: 'Anglais' },
];

export const TESTS = [
  cubes, rotation, tamicMaths, attention, francais, codage,
  cadran, culture, orientation, drones, vaisseau, secpil, t3a, math1, math3,
  anglais,
];

export const getTest = (id) => TESTS.find((t) => t.id === id);
