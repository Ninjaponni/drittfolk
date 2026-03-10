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
  { id: 'sad_idle', filename: 'Sad_Idle.glb', category: 'idle', label: 'Trist idle', loop: true },

  // Bevegelse
  { id: 'walk', filename: 'Walking.glb', category: 'locomotion', label: 'Gå', loop: true },

  // Gester — Claude velger fra disse
  { id: 'angry_point', filename: 'Standing_Arguing.glb', category: 'gesture', label: 'Peker sint', loop: false },
  { id: 'dismissive_wave', filename: 'Disappointed.glb', category: 'gesture', label: 'Avvisende', loop: false },
  { id: 'talking', filename: 'Talking.glb', category: 'gesture', label: 'Snakker', loop: false },
  { id: 'talking_excited', filename: 'Talking_2.glb', category: 'gesture', label: 'Snakker ivrig', loop: false },
  { id: 'talking_intense', filename: 'Talking_3.glb', category: 'gesture', label: 'Snakker intenst', loop: false },
  { id: 'telling_secret', filename: 'Telling_A_Secret.glb', category: 'gesture', label: 'Hvisker', loop: false },
  { id: 'crazy_gesture', filename: 'Crazy_Gesture.glb', category: 'gesture', label: 'Gal gest', loop: false },

  // Reaksjoner
  { id: 'cheering', filename: 'Cheering.glb', category: 'reaction', label: 'Jubler', loop: false },
  { id: 'disappointed', filename: 'Disappointed.glb', category: 'reaction', label: 'Skuffet', loop: false },
  { id: 'laughing', filename: 'Happy_Idle.glb', category: 'reaction', label: 'Ler', loop: false },

  // Følelser
  { id: 'sad', filename: 'Sad_Idle.glb', category: 'emotion', label: 'Trist', loop: false },
  { id: 'angry', filename: 'Standing_Arguing.glb', category: 'emotion', label: 'Sint', loop: false },
];

// Liste over gyldige animasjons-IDer (sendes til Claude)
export const VALID_ANIMATION_IDS = ANIMATIONS.map(a => a.id);

export function getAnimation(id: string): AnimationDef {
  return ANIMATIONS.find(a => a.id === id) || ANIMATIONS[0]; // fallback til idle
}
