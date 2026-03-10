// Synty Polygon Office Pack — 18 karaktermodeller
// Filnavn refererer til GLB-filer i /client/public/models/characters/

export type Gender = 'male' | 'female';

export interface CharacterModel {
  id: string;
  filename: string;
  gender: Gender;
  label: string;
}

export const CHARACTER_MODELS: CharacterModel[] = [
  // Menn
  { id: 'male_01', filename: 'SM_Chr_Developer_Male_01.glb', gender: 'male', label: 'Utvikler' },
  { id: 'male_02', filename: 'SM_Chr_Business_Male_01.glb', gender: 'male', label: 'Forretningsmann' },
  { id: 'male_03', filename: 'SM_Chr_Manager_Male_01.glb', gender: 'male', label: 'Sjef' },
  { id: 'male_04', filename: 'SM_Chr_IT_Male_01.glb', gender: 'male', label: 'IT-fyr' },
  { id: 'male_05', filename: 'SM_Chr_Intern_Male_01.glb', gender: 'male', label: 'Praktikant' },
  { id: 'male_06', filename: 'SM_Chr_Janitor_Male_01.glb', gender: 'male', label: 'Vaktmester' },
  { id: 'male_07', filename: 'SM_Chr_Security_Male_01.glb', gender: 'male', label: 'Vekter' },
  { id: 'male_08', filename: 'SM_Chr_Delivery_Male_01.glb', gender: 'male', label: 'Budbil' },
  { id: 'male_09', filename: 'SM_Chr_Accountant_Male_01.glb', gender: 'male', label: 'Regnskapsfører' },
  // Kvinner
  { id: 'female_01', filename: 'SM_Chr_Developer_Female_01.glb', gender: 'female', label: 'Utvikler' },
  { id: 'female_02', filename: 'SM_Chr_Business_Female_01.glb', gender: 'female', label: 'Forretningskvinne' },
  { id: 'female_03', filename: 'SM_Chr_Manager_Female_01.glb', gender: 'female', label: 'Sjef' },
  { id: 'female_04', filename: 'SM_Chr_IT_Female_01.glb', gender: 'female', label: 'IT-dame' },
  { id: 'female_05', filename: 'SM_Chr_Intern_Female_01.glb', gender: 'female', label: 'Praktikant' },
  { id: 'female_06', filename: 'SM_Chr_Receptionist_Female_01.glb', gender: 'female', label: 'Resepsjonist' },
  { id: 'female_07', filename: 'SM_Chr_HR_Female_01.glb', gender: 'female', label: 'HR' },
  { id: 'female_08', filename: 'SM_Chr_Accountant_Female_01.glb', gender: 'female', label: 'Regnskapsfører' },
  { id: 'female_09', filename: 'SM_Chr_Secretary_Female_01.glb', gender: 'female', label: 'Sekretær' },
];

export function getModelsByGender(gender: Gender): CharacterModel[] {
  return CHARACTER_MODELS.filter(m => m.gender === gender);
}

export function getRandomModel(gender: Gender): CharacterModel {
  const models = getModelsByGender(gender);
  return models[Math.floor(Math.random() * models.length)];
}
