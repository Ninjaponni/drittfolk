// Synty Polygon Office Pack — 18 karaktermodeller (faktiske filnavn)

export type Gender = 'male' | 'female';

export interface CharacterModel {
  id: string;
  filename: string;
  gender: Gender;
  label: string;
}

export const CHARACTER_MODELS: CharacterModel[] = [
  // Menn
  { id: 'boss_male', filename: 'SK_Chr_Boss_Male_01.glb', gender: 'male', label: 'Sjef' },
  { id: 'business_male_01', filename: 'SK_Chr_Business_Male_01.glb', gender: 'male', label: 'Forretningsmann' },
  { id: 'business_male_02', filename: 'SK_Chr_Business_Male_02.glb', gender: 'male', label: 'Selger' },
  { id: 'business_male_03', filename: 'SK_Chr_Business_Male_03.glb', gender: 'male', label: 'Konsulent' },
  { id: 'business_male_04', filename: 'SK_Chr_Business_Male_04.glb', gender: 'male', label: 'Investor' },
  { id: 'cleaner_male', filename: 'SK_Chr_Cleaner_Male_01.glb', gender: 'male', label: 'Vaskehjelp' },
  { id: 'developer_male_01', filename: 'SK_Chr_Developer_Male_01.glb', gender: 'male', label: 'Utvikler' },
  { id: 'developer_male_02', filename: 'SK_Chr_Developer_Male_02.glb', gender: 'male', label: 'Senior-dev' },
  { id: 'security_male', filename: 'SK_Chr_Security_Male_01.glb', gender: 'male', label: 'Vekter' },
  // Kvinner
  { id: 'boss_female', filename: 'SK_Chr_Boss_Female_01.glb', gender: 'female', label: 'Sjef' },
  { id: 'business_female_01', filename: 'SK_Chr_Business_Female_01.glb', gender: 'female', label: 'Forretningskvinne' },
  { id: 'business_female_02', filename: 'SK_Chr_Business_Female_02.glb', gender: 'female', label: 'Selger' },
  { id: 'business_female_03', filename: 'SK_Chr_Business_Female_03.glb', gender: 'female', label: 'Konsulent' },
  { id: 'business_female_04', filename: 'SK_Chr_Business_Female_04.glb', gender: 'female', label: 'Investor' },
  { id: 'cleaner_female', filename: 'SK_Chr_Cleaner_Female_01.glb', gender: 'female', label: 'Vaskehjelp' },
  { id: 'developer_female_01', filename: 'SK_Chr_Developer_Female_01.glb', gender: 'female', label: 'Utvikler' },
  { id: 'developer_female_02', filename: 'SK_Chr_Developer_Female_02.glb', gender: 'female', label: 'Senior-dev' },
  { id: 'security_female', filename: 'SK_Chr_Security_Female_01.glb', gender: 'female', label: 'Vekter' },
];

export function getModelsByGender(gender: Gender): CharacterModel[] {
  return CHARACTER_MODELS.filter(m => m.gender === gender);
}

export function getRandomModel(gender: Gender): CharacterModel {
  const models = getModelsByGender(gender);
  return models[Math.floor(Math.random() * models.length)];
}
