// Mixamo-animasjoner konvertert til GLB
// Filnavn refererer til /client/public/models/animations/

export type AnimationCategory = 'idle' | 'locomotion' | 'gesture' | 'reaction' | 'emotion';

export interface AnimationDef {
  id: string;
  filename: string;
  category: AnimationCategory;
  label: string;
  loop: boolean;
}

export const ANIMATIONS: AnimationDef[] = [
  // Idle
  { id: 'idle', filename: 'Idle.glb', category: 'idle', label: 'Idle', loop: true },
  { id: 'happy_idle', filename: 'Happy_Idle.glb', category: 'idle', label: 'Glad idle', loop: true },
  { id: 'sad_idle', filename: 'Sad_Idle_1.glb', category: 'idle', label: 'Trist idle', loop: true },

  // Bevegelse
  { id: 'walk', filename: 'Walking.glb', category: 'locomotion', label: 'Gå', loop: true },

  // Gester — brukes av tone-mapping
  { id: 'angry_point', filename: 'Standing_Arguing.glb', category: 'gesture', label: 'Peker sint', loop: false },
  { id: 'dismissive_wave', filename: 'Disappointed.glb', category: 'gesture', label: 'Avvisende', loop: false },
  { id: 'talking', filename: 'Talking_1.glb', category: 'gesture', label: 'Snakker', loop: false },
  { id: 'talking_excited', filename: 'Talking_2.glb', category: 'gesture', label: 'Snakker ivrig', loop: false },
  { id: 'talking_intense', filename: 'Talking_3.glb', category: 'gesture', label: 'Snakker intenst', loop: false },
  { id: 'telling_secret', filename: 'Telling_A_Secret.glb', category: 'gesture', label: 'Hvisker', loop: false },
  { id: 'crazy_gesture', filename: 'Crazy_Gesture.glb', category: 'gesture', label: 'Gal gest', loop: false },

  // Reaksjoner
  { id: 'cheering', filename: 'happy_hand_gesture.glb', category: 'reaction', label: 'Jubler', loop: false },
  { id: 'disappointed', filename: 'Disappointed.glb', category: 'reaction', label: 'Skuffet', loop: false },
  { id: 'laughing', filename: 'Happy_Idle.glb', category: 'reaction', label: 'Ler', loop: false },

  // Følelser
  { id: 'sad', filename: 'Sad_Idle_1.glb', category: 'emotion', label: 'Trist', loop: false },
  { id: 'angry', filename: 'Standing_Arguing.glb', category: 'emotion', label: 'Sint', loop: false },

  // Nye animasjoner for tone-mapping
  { id: 'dismissing_gesture', filename: 'dismissing_gesture.glb', category: 'gesture', label: 'Avvisende gest', loop: false },
  { id: 'happy_hand_gesture', filename: 'happy_hand_gesture.glb', category: 'gesture', label: 'Glad gest', loop: false },
  { id: 'being_cocky', filename: 'being_cocky.glb', category: 'gesture', label: 'Cocky', loop: false },
  { id: 'sarcastic_head_nod', filename: 'sarcastic_head_nod.glb', category: 'gesture', label: 'Sarkastisk nikk', loop: false },
  { id: 'annoyed_head_shake', filename: 'annoyed_head_shake.glb', category: 'reaction', label: 'Irritert risting', loop: false },
  { id: 'thoughtful_head_shake', filename: 'thoughtful_head_shake.glb', category: 'reaction', label: 'Tenksom risting', loop: false },
  { id: 'angry_gesture', filename: 'angry_gesture.glb', category: 'gesture', label: 'Sint gest', loop: false },
  { id: 'look_away_gesture', filename: 'look_away_gesture.glb', category: 'gesture', label: 'Ser bort', loop: false },
  { id: 'acknowledging', filename: 'acknowledging.glb', category: 'reaction', label: 'Anerkjenner', loop: false },
  { id: 'weight_shift', filename: 'weight_shift.glb', category: 'idle', label: 'Vektskifte', loop: true },
];

// Liste over gyldige animasjons-IDer
export const VALID_ANIMATION_IDS = ANIMATIONS.map(a => a.id);

export function getAnimation(id: string): AnimationDef {
  return ANIMATIONS.find(a => a.id === id) || ANIMATIONS[0]; // fallback til idle
}

export const DEFAULT_SPEAKER_ANIM = 'Talking_2.glb';
export const DEFAULT_LISTENER_ANIM = 'acknowledging.glb';

// Lytter-pose mens den venter (mellom linjer)
export const LISTENING_ANIM = 'weight_shift.glb';

// Animasjonspooler — konvertert med FBX2glTF (--binary, UTEN draco)
export const IDLE_POOL = [
  'Breathing_Idle.glb', 'Idle.glb', 'Idle_1.glb', 'Idle_2.glb',
  'Happy_Idle.glb', 'Neutral_Idle.glb',
];

export const WALK_POOL = [
  'Walking.glb', 'Walking_2.glb',
];

// Kjønnsbestemt walk — menn bruker Walking, damer bruker Walking_2
export const WALK_MALE = 'Walking.glb'
export const WALK_FEMALE = 'Walking_2.glb'

export const INSULT_POOL = [
  'Standing_Arguing.glb', 'Standing_Arguing_1.glb',
  'Talking_1.glb', 'Talking_2.glb', 'Talking_3.glb', 'Talking_4.glb',
  'Yelling.glb',
];

export const REACTION_POOL = [
  'Disappointed.glb', 'Sad_Idle_1.glb', 'annoyed_head_shake.glb',
  'thoughtful_head_shake.glb', 'angry_gesture.glb', 'look_away_gesture.glb',
  'acknowledging.glb', 'shaking_head_no.glb',
  'Hands_Forward_Gesture.glb', 'Whatever_Gesture.glb',
];

export function randomFrom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}
