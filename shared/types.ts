// Delte typer mellom client og server

export interface Avatar {
  id: string;
  name: string;
  gender: 'male' | 'female';
  language: 'no' | 'en';
  personality_type: PersonalityType;
  character_model: string;
  texture_variant: number;
  hair_color: string;
  top_color: string;
  pants_color: string;
  email: string;
  position_x: number;
  position_y: number;
  position_z: number;
  stats_insults_given: number;
  stats_insults_received: number;
  created_at: string;
  last_interaction_at: string | null;
}

export type PersonalityType =
  | 'aggressive'
  | 'passive_aggressive'
  | 'arrogant'
  | 'sarcastic'
  | 'dramatic'
  | 'sycophant'
  | 'narcissist';

export const PERSONALITY_LABELS: Record<PersonalityType, { no: string; en: string; desc_no: string; desc_en: string }> = {
  aggressive: {
    no: 'Aggressiv',
    en: 'Aggressive',
    desc_no: 'Direkte, høylytt, konfronterende',
    desc_en: 'Direct, loud, confrontational',
  },
  passive_aggressive: {
    no: 'Passiv-aggressiv',
    en: 'Passive-aggressive',
    desc_no: 'Stikk med et smil, subtile fornærmelser',
    desc_en: 'Stabs with a smile, subtle insults',
  },
  arrogant: {
    no: 'Arrogant',
    en: 'Arrogant',
    desc_no: 'Ser ned på alle, bedreviter',
    desc_en: 'Looks down on everyone, know-it-all',
  },
  sarcastic: {
    no: 'Sarkastisk',
    en: 'Sarcastic',
    desc_no: 'Alt er ironi, tørrvittig',
    desc_en: 'Everything is irony, dry wit',
  },
  dramatic: {
    no: 'Dramatisk',
    en: 'Dramatic',
    desc_no: 'Overdriver alt, Queen/King of drama',
    desc_en: 'Over-the-top, Queen/King of drama',
  },
  sycophant: {
    no: 'Smiskete',
    en: 'Sycophant',
    desc_no: 'Falsk hyggelig, dolker i ryggen',
    desc_en: 'Fake nice, stabs in the back',
  },
  narcissist: {
    no: 'Narsisist',
    en: 'Narcissist',
    desc_no: 'Alt handler om meg, alle er under meg',
    desc_en: 'Everything is about me, everyone is beneath me',
  },
};

export interface Interaction {
  id: string;
  speaker_id: string;
  target_id: string;
  dialogue: string;
  response_dialogue: string;
  speaker_animation: string;
  target_animation: string;
  created_at: string;
}

// Gyldige toner — Claude velger, systemet mapper til animasjon
export type DialogTone =
  | 'aggressive' | 'dismissive' | 'amused' | 'mocking' | 'shocked'
  | 'desperate' | 'sarcastic' | 'smug' | 'defeated' | 'disgusted' | 'confused';

export interface DialogLine {
  speaker: 'speaker' | 'target';
  text: string;
  tone: DialogTone;
}

// Nye interaksjons-events (erstatter InsultEvent)
export interface InteractionStartEvent {
  id: string;
  speakerId: string;
  targetId: string;
}

export interface InteractionLinesEvent {
  id: string;
  lines: DialogLine[];
}

export interface InteractionEndEvent {
  id: string;
}

// Beholdes for bakoverkompatibilitet
export interface InsultEvent {
  speakerId: string;
  targetId: string;
  dialogue: string;
  responseDialogue: string;
  speakerAnimation: string;
  targetAnimation: string;
}

export interface AvatarStats {
  nemesis: { name: string; count: number } | null;
  favorite_insult: string | null;
  worst_received: { text: string; from: string } | null;
  favorite_word: string | null;
}

export interface CreateAvatarInput {
  name: string;
  gender: 'male' | 'female';
  personality_type: PersonalityType;
  email?: string;
}
