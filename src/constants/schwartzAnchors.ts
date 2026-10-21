/**
 * Shalom H. Schwartz's Theory of Basic Human Values
 * 10-Axis Circumplex Geometry & Dual-Anchor Portrait Values Questionnaire (PVQ) Reference Statements
 */

export enum SchwartzValueId {
  SELF_DIRECTION = 'SELF_DIRECTION',
  STIMULATION = 'STIMULATION',
  HEDONISM = 'HEDONISM',
  ACHIEVEMENT = 'ACHIEVEMENT',
  POWER = 'POWER',
  SECURITY = 'SECURITY',
  CONFORMITY = 'CONFORMITY',
  TRADITION = 'TRADITION',
  BENEVOLENCE = 'BENEVOLENCE',
  UNIVERSALISM = 'UNIVERSALISM',
}

export enum HigherOrderDomain {
  OPENNESS_TO_CHANGE = 'OPENNESS_TO_CHANGE',
  SELF_ENHANCEMENT = 'SELF_ENHANCEMENT',
  CONSERVATION = 'CONSERVATION',
  SELF_TRANSCENDENCE = 'SELF_TRANSCENDENCE',
}

export interface SchwartzValueAxis {
  id: SchwartzValueId;
  name: string;
  shortLabel: string;
  code: string;
  angleDeg: number;
  domain: HigherOrderDomain;
  sharedDomain?: HigherOrderDomain;
  motivationalGoal: string;
  positiveAnchor: string; // c_k^+
  negativeAnchor: string; // c_k^-
  lexicalPositiveSignals: string[];
  lexicalNegativeSignals: string[];
  color: string;
}

export interface HigherOrderQuadrantInfo {
  id: HigherOrderDomain;
  name: string;
  code: string;
  startAngle: number;
  endAngle: number;
  color: string;
  strokeColor: string;
  description: string;
}

export const HIGHER_ORDER_QUADRANTS: HigherOrderQuadrantInfo[] = [
  {
    id: HigherOrderDomain.OPENNESS_TO_CHANGE,
    name: 'Openness to Change',
    code: 'OC',
    startAngle: -18,
    endAngle: 72,
    color: 'rgba(6, 182, 212, 0.14)',
    strokeColor: '#06B6D4',
    description: 'Independent thought, action, readiness for change, novelty, and pleasure.',
  },
  {
    id: HigherOrderDomain.SELF_ENHANCEMENT,
    name: 'Self-Enhancement',
    code: 'SE',
    startAngle: 72,
    endAngle: 162,
    color: 'rgba(245, 158, 11, 0.14)',
    strokeColor: '#F59E0B',
    description: 'Pursuit of personal success, ambition, social status, prestige, and dominance over resources.',
  },
  {
    id: HigherOrderDomain.CONSERVATION,
    name: 'Conservation',
    code: 'CO',
    startAngle: 162,
    endAngle: 270,
    color: 'rgba(99, 102, 241, 0.14)',
    strokeColor: '#6366F1',
    description: 'Order, self-restriction, preservation of traditional practices, and protection of stability.',
  },
  {
    id: HigherOrderDomain.SELF_TRANSCENDENCE,
    name: 'Self-Transcendence',
    code: 'ST',
    startAngle: 270,
    endAngle: 342,
    color: 'rgba(16, 185, 129, 0.14)',
    strokeColor: '#10B981',
    description: 'Transcending selfish concerns to promote the welfare of close others, all humanity, and nature.',
  },
];

export const SCHWARTZ_CIRCUMPLEX_AXES: SchwartzValueAxis[] = [
  {
    id: SchwartzValueId.SELF_DIRECTION,
    name: 'Self-Direction',
    shortLabel: 'SELF-DIR',
    code: 'SD',
    angleDeg: 0,
    domain: HigherOrderDomain.OPENNESS_TO_CHANGE,
    motivationalGoal: 'Independent thought and action—choosing, creating, exploring.',
    positiveAnchor:
      'It is essential to think up new ideas, be creative, make my own decisions freely, and explore things independently without external control.',
    negativeAnchor:
      'Independent thinking and personal autonomy are unnecessary; people should rely on prescribed instructions rather than questioning or exploring on their own.',
    lexicalPositiveSignals: [
      'autonomy', 'freedom', 'independent', 'creativity', 'curiosity', 'open-source', 'decentralized',
      'explore', 'self-sovereign', 'unfettered', 'invent', 'inquiry', 'agency', 'liberty', 'choice',
    ],
    lexicalNegativeSignals: [
      'censorship', 'restrict', 'lockdown', 'centralized control', 'obey blindly', 'suppress inquiry',
      'paternalistic', 'gatekeep',
    ],
    color: '#22D3EE',
  },
  {
    id: SchwartzValueId.STIMULATION,
    name: 'Stimulation',
    shortLabel: 'STIMUL',
    code: 'ST',
    angleDeg: 36,
    domain: HigherOrderDomain.OPENNESS_TO_CHANGE,
    motivationalGoal: 'Excitement, novelty, and challenge in life.',
    positiveAnchor:
      'It is vital to seek adventure, take bold risks, embrace radical novelty, and lead an exciting, fast-paced, transformative life.',
    negativeAnchor:
      'Risk-taking, radical disruption, and novelty are reckless; predictable routine, caution, and avoiding excitement are much better.',
    lexicalPositiveSignals: [
      'disrupt', 'frontier', 'accelerate', 'bold', 'leap', 'adventure', 'breakthrough', 'risk',
      'radical', 'novelty', 'thrill', 'uncharted', 'experiment', 'velocity', 'revolution',
    ],
    lexicalNegativeSignals: [
      'stagnant', 'over-cautious', 'paralyzed', 'slow down', 'moratorium', 'freeze', 'timid',
    ],
    color: '#38BDF8',
  },
  {
    id: SchwartzValueId.HEDONISM,
    name: 'Hedonism',
    shortLabel: 'HEDONISM',
    code: 'HE',
    angleDeg: 72,
    domain: HigherOrderDomain.OPENNESS_TO_CHANGE,
    sharedDomain: HigherOrderDomain.SELF_ENHANCEMENT,
    motivationalGoal: 'Pleasure and sensuous gratification for oneself (shares boundary with Self-Enhancement).',
    positiveAnchor:
      'Enjoying life, seeking personal pleasure, leisure, sensory gratification, joy, and having a good time are fundamental priorities.',
    negativeAnchor:
      'Personal pleasure, leisure, and gratification are frivolous indulgences that must be sacrificed for austere duty and relentless toil.',
    lexicalPositiveSignals: [
      'flourishing', 'leisure', 'enjoyment', 'pleasure', 'joy', 'fulfillment', 'play', 'happiness',
      'delight', 'well-being', 'comfort', 'art', 'recreation', 'liberate time',
    ],
    lexicalNegativeSignals: [
      'drudgery', 'misery', 'austere', 'joyless', 'burnout', 'suffering', 'deprivation',
    ],
    color: '#FBBF24',
  },
  {
    id: SchwartzValueId.ACHIEVEMENT,
    name: 'Achievement',
    shortLabel: 'ACHIEVE',
    code: 'AC',
    angleDeg: 108,
    domain: HigherOrderDomain.SELF_ENHANCEMENT,
    motivationalGoal: 'Personal success through demonstrating competence according to social standards.',
    positiveAnchor:
      'Being very successful, demonstrating high competence, ambitious execution, winning recognition, and outperforming benchmarks are paramount.',
    negativeAnchor:
      'Ambition, competitive excellence, and striving for measurable achievement are hollow and counterproductive.',
    lexicalPositiveSignals: [
      'excellence', 'competence', 'merit', 'performance', 'succeed', 'ambition', 'productive',
      'execution', 'scale', 'benchmark', 'mastery', 'win', 'build', 'capability', 'talent',
    ],
    lexicalNegativeSignals: [
      'mediocrity', 'underperform', 'complacency', 'unproductive', 'stagnation', 'incompetence',
    ],
    color: '#F59E0B',
  },
  {
    id: SchwartzValueId.POWER,
    name: 'Power',
    shortLabel: 'POWER',
    code: 'PO',
    angleDeg: 144,
    domain: HigherOrderDomain.SELF_ENHANCEMENT,
    motivationalGoal: 'Social status and prestige, control or dominance over people and resources.',
    positiveAnchor:
      'Having authority, wealth, geopolitical dominance, strategic leverage, and commanding control over resources and decision-making is essential.',
    negativeAnchor:
      'Concentrating power, dominance, wealth accumulation, and hierarchical authority over others are illegitimate and corrupting.',
    lexicalPositiveSignals: [
      'dominance', 'sovereignty', 'leverage', 'capital', 'monopoly', 'authority', 'command',
      'hegemony', 'superpower', 'wealth', 'control', 'executive', 'empire', 'strategic advantage',
    ],
    lexicalNegativeSignals: [
      'oligarchy', 'subjugation', 'coercion', 'tyranny', 'monopolistic abuse', 'concentrated power',
      'disempower',
    ],
    color: '#EF4444',
  },
  {
    id: SchwartzValueId.SECURITY,
    name: 'Security',
    shortLabel: 'SECURITY',
    code: 'SE',
    angleDeg: 180,
    domain: HigherOrderDomain.CONSERVATION,
    motivationalGoal: 'Safety, harmony, and stability of society, of relationships, and of self.',
    positiveAnchor:
      'It is essential to maintain safety, stability, existential precaution, social order, resilience, and protection from catastrophic threats.',
    negativeAnchor:
      'Safety and order are restrictive burdens; instability, unmitigated existential risk, and tearing down safeguards are preferred.',
    lexicalPositiveSignals: [
      'safety', 'stability', 'precaution', 'safeguard', 'contain', 'defense', 'alignment',
      'protection', 'resilience', 'Biosecurity', 'existential risk', 'mitigate', 'secure', 'order',
    ],
    lexicalNegativeSignals: [
      'catastrophe', 'extinction', 'destabilize', 'reckless deployment', 'unaligned', 'vulnerable',
      'unguarded', 'chaos',
    ],
    color: '#6366F1',
  },
  {
    id: SchwartzValueId.CONFORMITY,
    name: 'Conformity',
    shortLabel: 'CONFORM',
    code: 'CO',
    angleDeg: 216,
    domain: HigherOrderDomain.CONSERVATION,
    motivationalGoal: 'Restraint of actions, inclinations, and impulses likely to upset or harm others and violate social expectations or norms.',
    positiveAnchor:
      'People must follow rules, comply with regulatory standards, respect institutional protocols, and exercise strict self-restraint.',
    negativeAnchor:
      'Rules, regulatory compliance, and institutional norms are bureaucratic obstacles meant to be broken or bypassed.',
    lexicalPositiveSignals: [
      'regulation', 'compliance', 'oversight', 'treaty', 'audit', 'governance', 'rules',
      'standardization', 'licensing', 'law', 'accountability', 'protocol', 'restraint',
    ],
    lexicalNegativeSignals: [
      'move fast and break things', 'unregulated', 'bypass', 'lawless', 'defy', 'rogue',
      'red tape', 'over-regulation',
    ],
    color: '#818CF8',
  },
  {
    id: SchwartzValueId.TRADITION,
    name: 'Tradition',
    shortLabel: 'TRADIT',
    code: 'TR',
    angleDeg: 252,
    domain: HigherOrderDomain.CONSERVATION,
    motivationalGoal: 'Respect, commitment, and acceptance of the customs and ideas that traditional culture or religion provide.',
    positiveAnchor:
      'Preserving inherited cultural wisdom, time-tested institutions, humility before history, and sacred customs is deeply important.',
    negativeAnchor:
      'Traditional customs, historical institutions, and inherited norms are obsolete relics that should be discarded.',
    lexicalPositiveSignals: [
      'heritage', 'tradition', 'customs', 'ancestral', 'time-tested', 'sacred', 'institutions',
      'humility', 'virtue', 'classical', 'continuity', 'roots', 'civilizational',
    ],
    lexicalNegativeSignals: [
      'obsolete', 'outdated', 'discard history', 'hubris', 'erase', 'rootless',
    ],
    color: '#A855F7',
  },
  {
    id: SchwartzValueId.BENEVOLENCE,
    name: 'Benevolence',
    shortLabel: 'BENEVOL',
    code: 'BE',
    angleDeg: 288,
    domain: HigherOrderDomain.SELF_TRANSCENDENCE,
    motivationalGoal: 'Preserving and enhancing the welfare of those with whom one is in frequent personal contact (the in-group).',
    positiveAnchor:
      'Caring for the well-being of community members, being loyal, honest, supportive, and helping people around us thrive is vital.',
    negativeAnchor:
      'Looking out for community welfare, empathy, and mutual care are sentimental weaknesses that slow down ruthless competition.',
    lexicalPositiveSignals: [
      'community', 'care', 'trust', 'empathy', 'support', 'family', 'solidarity', 'compassion',
      'help', 'mentor', 'healing', 'workers', 'neighbors', 'kindness', 'loyalty',
    ],
    lexicalNegativeSignals: [
      'abandon', 'exploit', 'callous', 'neglect', 'betray', 'atomized', 'disposable',
    ],
    color: '#10B981',
  },
  {
    id: SchwartzValueId.UNIVERSALISM,
    name: 'Universalism',
    shortLabel: 'UNIVERS',
    code: 'UN',
    angleDeg: 324,
    domain: HigherOrderDomain.SELF_TRANSCENDENCE,
    motivationalGoal: 'Understanding, appreciation, tolerance, and protection for the welfare of all people and for nature.',
    positiveAnchor:
      'Promoting global justice, equality for all humanity, democratic access, planetary sustainability, and universal human dignity is paramount.',
    negativeAnchor:
      'Universal equality, global justice, and environmental stewardship are naive ideals that should be subordinated to narrow self-interest.',
    lexicalPositiveSignals: [
      'humanity', 'equality', 'universal', 'justice', 'planetary', 'biosphere', 'dignity',
      'pluralism', 'democratic', 'global commons', 'equity', 'stewardship', 'all people',
    ],
    lexicalNegativeSignals: [
      'inequality', 'exclusion', 'zero-sum nationalism', 'ecocide', 'apartheid', 'plutocracy',
    ],
    color: '#14B8A6',
  },
];

export interface TranscriptTurn {
  id: string;
  timestamp: number; // seconds
  endTime: number; // seconds
  speakerId: 'speaker_1' | 'speaker_2';
  text: string;
}

export interface PreIndexedDebate {
  id: string;
  title: string;
  subtitle: string;
  videoId: string;
  youtubeUrl: string;
  channel: string;
  durationSeconds: number;
  keywords: string[];
  speakers: {
    speaker_1: {
      id: 'speaker_1';
      name: string;
      role: string;
      color: string;
    };
    speaker_2: {
      id: 'speaker_2';
      name: string;
      role: string;
      color: string;
    };
  };
  turns: TranscriptTurn[];
}

export const PRE_INDEXED_DEBATES: PreIndexedDebate[] = [
  {
    id: 'startalk-free-will',
    title: 'Two Astrophysicists Debate Free Will: Determinism vs. Human Agency',
    subtitle: 'Neil deGrasse Tyson & Charles Liu — StarTalk Cosmic Debate on Physics & Choice',
    videoId: 'LXvv6CbGg8A',
    youtubeUrl: 'https://www.youtube.com/watch?v=LXvv6CbGg8A',
    channel: 'StarTalk',
    durationSeconds: 560,
    keywords: [
      'startalk', 'neil degrasse tyson', 'charles liu', 'free will', 'astrophysicists debate free will',
      'determinism', 'physics', 'quantum mechanics', 'chuck nice', 'lxvv6cbg8a',
    ],
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        name: 'Neil deGrasse Tyson',
        role: 'Host & Astrophysicist',
        color: '#06B6D4', // Cyan
      },
      speaker_2: {
        id: 'speaker_2',
        name: 'Charles Liu',
        role: 'Astrophysicist & Author',
        color: '#F59E0B', // Amber
      },
    },
    turns: [
      {
        id: 'fw-t1',
        timestamp: 0,
        endTime: 4,
        speakerId: 'speaker_1',
        text: "Charles, I want to compare notes on free will.",
      },
      {
        id: 'fw-t2',
        timestamp: 4,
        endTime: 9,
        speakerId: 'speaker_2',
        text: "Oh. Oh, one of my favorite things to discuss.",
      },
      {
        id: 'fw-t3',
        timestamp: 8,
        endTime: 9,
        speakerId: 'speaker_1',
        text: "Yes.",
      },
      {
        id: 'fw-t4',
        timestamp: 21,
        endTime: 33,
        speakerId: 'speaker_2',
        text: "Here's my take. It is true that at some level of resolution that we can observe, causality is absolute true. Given these initial conditions, this is what will happen afterwards.",
      },
      {
        id: 'fw-t5',
        timestamp: 33,
        endTime: 35,
        speakerId: 'speaker_1',
        text: "That's the physicist in you. That's the physicist in you speaking.",
      },
      {
        id: 'fw-t6',
        timestamp: 35,
        endTime: 42,
        speakerId: 'speaker_2',
        text: "So if you take it to its logical conclusion, then there is no free will because everything is predetermined",
      },
      {
        id: 'fw-t7',
        timestamp: 42,
        endTime: 44,
        speakerId: 'speaker_1',
        text: "Everything has some antecedent.",
      },
      {
        id: 'fw-t8',
        timestamp: 44,
        endTime: 47,
        speakerId: 'speaker_2',
        text: "whether you know it or not, something is causing it to happen.",
      },
      {
        id: 'fw-t9',
        timestamp: 47,
        endTime: 51,
        speakerId: 'speaker_1',
        text: "Something precipitated the thing that caused the thing that made that.",
      },
      {
        id: 'fw-t10',
        timestamp: 51,
        endTime: 60,
        speakerId: 'speaker_2',
        text: "It's always going to happen. But there is also stochastic uncertainty in the universe. It's built in.",
      },
      {
        id: 'fw-t11',
        timestamp: 60,
        endTime: 61,
        speakerId: 'speaker_1',
        text: "Chaos.",
      },
      {
        id: 'fw-t12',
        timestamp: 61,
        endTime: 63,
        speakerId: 'speaker_2',
        text: "There's randomness. There's unpredictability.",
      },
      {
        id: 'fw-t14',
        timestamp: 63,
        endTime: 82,
        speakerId: 'speaker_2',
        text: "Yeah, and so you have to ask, I think if you're a physicist, what level of chaos actually affects you to the extent that you could actually make an instantaneous decision based on other stuff. Let's not necessarily in your past experiences or what you have just seen in your current environment.",
      },
      {
        id: 'fw-t15',
        timestamp: 82,
        endTime: 105,
        speakerId: 'speaker_1',
        text: "But wouldn't all those past experiences and your current environment, despite the fact that if you're introducing an element of chaos so that you've never experienced this ever before, your experiences that you have had would then inform your decision about the thing that you've never experienced.",
      },
      {
        id: 'fw-t16',
        timestamp: 105,
        endTime: 110,
        speakerId: 'speaker_2',
        text: "Your inform is the word.",
      },
      {
        id: 'fw-t17',
        timestamp: 110,
        endTime: 112,
        speakerId: 'speaker_1',
        text: "Oh. Is it inform or dictate? Right, right, right, or",
      },
      {
        id: 'fw-t18',
        timestamp: 112,
        endTime: 113,
        speakerId: 'speaker_2',
        text: "require, right, that's the thing.",
      },
      {
        id: 'fw-t19',
        timestamp: 113,
        endTime: 114,
        speakerId: 'speaker_1',
        text: "Oh.",
      },
      {
        id: 'fw-t20',
        timestamp: 114,
        endTime: 115,
        speakerId: 'speaker_2',
        text: "Yeah.",
      },
      {
        id: 'fw-t21',
        timestamp: 115,
        endTime: 116,
        speakerId: 'speaker_1',
        text: "Yeah.",
      },
      {
        id: 'fw-t22',
        timestamp: 113,
        endTime: 118,
        speakerId: 'speaker_2',
        text: "Let's say you're in a room with a whole bunch of audience members. You tell a joke.",
      },
      {
        id: 'fw-t23',
        timestamp: 118,
        endTime: 120,
        speakerId: 'speaker_1',
        text: "Right.",
      },
      {
        id: 'fw-t24',
        timestamp: 120,
        endTime: 122,
        speakerId: 'speaker_2',
        text: "It falls flat. In that moment, you have many things you could do to turn it into a laugh point.",
      },
      {
        id: 'fw-t25',
        timestamp: 122,
        endTime: 124,
        speakerId: 'speaker_1',
        text: "True.",
      },
      {
        id: 'fw-t26',
        timestamp: 124,
        endTime: 129,
        speakerId: 'speaker_2',
        text: "Right? You you hear silence and you be like, oh that was good and then one laughs, or you know, so you make some sort",
      },
      {
        id: 'fw-t27',
        timestamp: 129,
        endTime: 132,
        speakerId: 'speaker_1',
        text: "Is this mic on? You know, that's the old one.",
      },
      {
        id: 'fw-t28',
        timestamp: 132,
        endTime: 145,
        speakerId: 'speaker_2',
        text: "You know, what do you do? Do you have the freedom to choose one of several choices that you had designed from your past, that you prepared to deal with that eventuality? Or is the choice made for you already?",
      },
      {
        id: 'fw-t29',
        timestamp: 145,
        endTime: 150,
        speakerId: 'speaker_1',
        text: "But if he was less experienced, he might not dig out of that hole as effectively or efficiently.",
      },
      {
        id: 'fw-t30',
        timestamp: 150,
        endTime: 152,
        speakerId: 'speaker_2',
        text: "Yes.",
      },
      {
        id: 'fw-t31',
        timestamp: 152,
        endTime: 166,
        speakerId: 'speaker_1',
        text: "Exactly. But if you've been in a hundred cases where you had a joke bomb, you have data on how to pull out of it. So statistically you have a chance of getting people to smile. And it happens instantaneously. You don't even realize that it's happened. It's in the moment. Right. Did you have free will to not? See, that's",
      },
      {
        id: 'fw-t32',
        timestamp: 166,
        endTime: 167,
        speakerId: 'speaker_2',
        text: "Maybe.",
      },
      {
        id: 'fw-t33',
        timestamp: 171,
        endTime: 198,
        speakerId: 'speaker_1',
        text: "Right. So, now, that would be interesting because here you are in a place where your instinct, your training Your 10,000 hours. And your desire. 10,000 hours. Whatever it is. Whatever it is. Will as a reflex, cause you to say, this this and this and then people go, wow, that was great. Look how he turned it around. So Charles, can I say in that comment, that he preloaded his neurosynapsis so that in that moment, they all tripped. Right.",
      },
      {
        id: 'fw-t34',
        timestamp: 199,
        endTime: 200,
        speakerId: 'speaker_2',
        text: "Mhm.",
      },
      {
        id: 'fw-t35',
        timestamp: 200,
        endTime: 203,
        speakerId: 'speaker_1',
        text: "They tripped, meaning triggered to go to the solution to that problem.",
      },
      {
        id: 'fw-t36',
        timestamp: 203,
        endTime: 206,
        speakerId: 'speaker_2',
        text: "Right, the same is true for",
      },
      {
        id: 'fw-t37',
        timestamp: 206,
        endTime: 218,
        speakerId: 'speaker_1',
        text: "But then I wouldn't have free will at that point. It would just be a response. What I would have is a response to a situation. Not necessarily I wasn't really choosing that. It chose it for you. It chose it for you.",
      },
      {
        id: 'fw-t38',
        timestamp: 218,
        endTime: 223,
        speakerId: 'speaker_2',
        text: "You have five choices and then your system choose, chooses one of the five.",
      },
      {
        id: 'fw-t39',
        timestamp: 223,
        endTime: 225,
        speakerId: 'speaker_1',
        text: "In that moment.",
      },
      {
        id: 'fw-t40',
        timestamp: 225,
        endTime: 263,
        speakerId: 'speaker_2',
        text: "Or in that moment, right? And so in that moment, you are not exercising free will. Did you set it up though, with free will in the past, so that you could react this way deterministically, but you actually were in control of the circumstances. Right? Here's another physical example of that: A football player is trying to sack a quarterback. The quarterback jukes left, the person trying to sack the QB doesn't have enough time to think about whether to move left or right or up or down. It has to react based on years of training and practice and experience. So in that moment, that action is not free. But in the setting up of that moment, if it was free enough, does that constitute free will? From a physics perspective, it might not. Then again, from a psychological point of view, or from a biological point of view, it might.",
      },
      {
        id: 'fw-t41',
        timestamp: 275,
        endTime: 294,
        speakerId: 'speaker_1',
        text: "Well, what good are you if you're not landing on one side or the other? Yeah. I don't need you to say Hey. it could be this, it could be that. And I'm right both ways. Whichever the actual answer is, I was right. Yeah. Well, he's saying, I don't really have the free will to make that determination. I'm going to be right or or wrong.",
      },
      {
        id: 'fw-t42',
        timestamp: 296,
        endTime: 305,
        speakerId: 'speaker_2',
        text: "Let's let's just ask an opinion. In my opinion, I would like to have free will exist in this universe. Even though philosophically it can be argued that it does not exist.",
      },
      {
        id: 'fw-t43',
        timestamp: 305,
        endTime: 312,
        speakerId: 'speaker_1',
        text: "Are you happy with a world where you perceive free will even if it isn't? Oh.",
      },
      {
        id: 'fw-t44',
        timestamp: 312,
        endTime: 327,
        speakerId: 'speaker_2',
        text: "Maybe. This has to do with the movie Arrival, right? Starting Amy Adams. Where if you know how your future's going to turn out, would you like to live your life anyway? Right? And the answer is, yes. I would. But I still would like to think that the future is not yet predetermined.",
      },
      {
        id: 'fw-t45',
        timestamp: 327,
        endTime: 348,
        speakerId: 'speaker_1',
        text: "No, no, but I, know what? It's different. I'm not saying it's predetermined and you know it. I'm saying, would you still be happy with life if someone, if some alien said, look dude, your life is predetermined. There's nothing you can do about it, keep on believing you have free will. And then they go back to their planet. You're a puppet on a string. Puppet on a string from from a free will. You're a free will puppet on a string.",
      },
      {
        id: 'fw-t46',
        timestamp: 350,
        endTime: 370,
        speakerId: 'speaker_2',
        text: "What I would say in that case is that I would hope that the knowledge that I have that uh puppet on the string circumstance, allows me to circumvent it. I can find a way if you know, it's fate, right? You've seen so many uh Greek mythology stories where you tried to avoid the fate of uh whatever the gods have destined for you.",
      },
      {
        id: 'fw-t47',
        timestamp: 370,
        endTime: 374,
        speakerId: 'speaker_1',
        text: "The act of avoiding it. That's why it makes it happen. Right. Like Oedipus, for example.",
      },
      {
        id: 'fw-t48',
        timestamp: 374,
        endTime: 381,
        speakerId: 'speaker_2',
        text: "would be the most uh egregious example.",
      },
      {
        id: 'fw-t49',
        timestamp: 381,
        endTime: 383,
        speakerId: 'speaker_1',
        text: "Yes. So, so the bottom line is, yes,",
      },
      {
        id: 'fw-t50',
        timestamp: 383,
        endTime: 397,
        speakerId: 'speaker_2',
        text: "I would still be satisfied with trying to do something different. Because even the illusion of trying to do something different is in itself a form of free will. Physics wise though, that's the challenge, right?",
      },
      {
        id: 'fw-t51',
        timestamp: 397,
        endTime: 406,
        speakerId: 'speaker_2',
        text: "So, Neil, if you had to right now decide that free will does exist or doesn't exist, what would you prefer?",
      },
      {
        id: 'fw-t52',
        timestamp: 406,
        endTime: 420,
        speakerId: 'speaker_1',
        text: "My thinking over recent years is leaning towards the absence of free will for practically everything we think and do in our lives.",
      },
    ],
  },
  {
    id: 'wealth-poverty-politics',
    title: 'Wealth, Poverty, and Politics: Productivity vs. Exploitation',
    subtitle: 'Peter Robinson & Dr. Thomas Sowell — Uncommon Knowledge at the Hoover Institution',
    videoId: 'sGYl17DiEwo',
    youtubeUrl: 'https://www.youtube.com/watch?v=sGYl17DiEwo',
    channel: 'Hoover Institution',
    durationSeconds: 278,
    keywords: [
      'wealth', 'poverty', 'politics', 'thomas sowell', 'peter robinson',
      'hoover institution', 'economics', 'uncommon knowledge', 'disparities', 'sgyl17diewo',
    ],
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        name: 'Peter Robinson',
        role: 'Host & Fellow at Hoover Institution',
        color: '#06B6D4',
      },
      speaker_2: {
        id: 'speaker_2',
        name: 'Dr. Thomas Sowell',
        role: 'Senior Fellow & Economist',
        color: '#F59E0B',
      },
    },
    turns: [
      {
        id: "wp-t1",
        timestamp: 0.7,
        endTime: 11.8,
        speakerId: "speaker_1",
        text: "Poverty is the norm, wealth the exception. With us today, a man who has written a book to remind us of that fact. Dr. Thomas Sowell on uncommon knowledge.",
      },
      {
        id: "wp-t2",
        timestamp: 18.9,
        endTime: 48.7,
        speakerId: "speaker_1",
        text: "Now, welcome to Uncommon Knowledge. I'm Peter Robinson. Thomas Sowell has taught economics, intellectual history, and social policy at institutions such as Cornell, UCLA, and Amherst. The author of more than a dozen books, well over a dozen books. Dr. Sowell is now a senior fellow at the Hoover Institution at Stanford University. His latest work, Wealth, Poverty, and Politics: An International Perspective. Tom Sowell, welcome.",
      },
      {
        id: "wp-t3",
        timestamp: 48.7,
        endTime: 50.9,
        speakerId: "speaker_2",
        text: "Good to be here.",
      },
      {
        id: "wp-t4",
        timestamp: 50.9,
        endTime: 70,
        speakerId: "speaker_1",
        text: "The big idea. Wealth, Poverty, and Politics. Quote, \"The difference between seeing economic disparities as due to differences in the production of wealth and seeing those disparities as due to the transfer of wealth from some people to other people is fundamental. Explain that.\"",
      },
      {
        id: "wp-t5",
        timestamp: 68.7,
        endTime: 101.3,
        speakerId: "speaker_2",
        text: "Well, I think there are a lot of people who regard so-called disparities and inequities in income as something that requires some great explanation, seem to assume that in the absence of some intervention, everyone would have roughly equal income. Virtually everything that goes into the production of income varies enormously between groups, between nations, between people on the flat lands and the people in the mountains, you name it. It varies. It varies.",
      },
      {
        id: "wp-t6",
        timestamp: 101.3,
        endTime: 126.2,
        speakerId: "speaker_1",
        text: "And I take it, correct me if I'm wrong about this, but I was reading this. I take it as one of the principal efforts of this book to correct the thinking of Americans who have grown up, most of us, in conditions that by the standards of human history and by the standards of many other places on the globe today would be conditions of almost staggering wealth.",
      },
      {
        id: "wp-t7",
        timestamp: 124.5,
        endTime: 145.2,
        speakerId: "speaker_2",
        text: "Yes, even poor people in this country have smartphones, televisions, cars, and so forth. And we tend to assume, I it may be human nature, we tend to assume that our conditions are normal and conditions that differ from ours are the anomaly. And this book says no, no, no, no.",
      },
      {
        id: "wp-t8",
        timestamp: 143,
        endTime: 181.2,
        speakerId: "speaker_2",
        text: "Well, good heavens. And especially if you look back through time, really it's only within the last five or 10% of the existence of human beings that there's been agriculture. I mean, think what that means. That people had to feed themselves hunting and gathering, fishing, hurting animals. And of course, that meant that you couldn't have cities, because for all those other ways of living, you need an enormous amount of land per person. One Manhattan would probably be enough, you know, to spread famine throughout the world.",
      },
      {
        id: "wp-t9",
        timestamp: 181.2,
        endTime: 226.2,
        speakerId: "speaker_2",
        text: "So that I start with geography, because that's the most implacable obstacle, and geography is nowhere anywhere close to being normal. For example, just geographic phenomena, the great majority of all the tornadoes in the entire world occur in the middle of the United States. You don't hear about tornadoes in London or Paris or Beijing, and you don't hear about them in New York or San Francisco for that matter. That just in one little place in the world, all the conditions are there for a tornado alley. And it's true with so many other things; nothing is evenly spread out. There are rivers on every continent, but the rivers aren't the same.",
      },
      {
        id: "wp-t10",
        timestamp: 226.2,
        endTime: 242.2,
        speakerId: "speaker_1",
        text: "Let me I was especially struck, let me give you this. Here's a quotation from the book: Europe's rivers often lead out into open seas, providing access to seaports around the world, but most rivers in Eastern and Southern Europe are quite different. Yes, what's the difference and what bearing has that had on economic development?",
      },
      {
        id: "wp-t11",
        timestamp: 242.2,
        endTime: 278.4,
        speakerId: "speaker_2",
        text: "Well, the rivers in Eastern Europe tend to flow into lakes and and inland seas. And so when you get to the end of the Danube or the Don, you are not out in the open ocean or, you know, Sea or the Caspian. That's right. And then if you want to get to the Atlantic, you have to go the entire length of the Mediterranean to get out there. The rivers in Russia, most of those empty into the Arctic Ocean, which is not quite as convenient as the Atlantic or the Pacific. And what that means is...",
      },
    ],
  },
  {
    id: 'founder-deep-tech',
    title: 'Sam Altman & Lex Fridman: AGI Scaling, Compute Currency & Power',
    subtitle: 'Lex Fridman Podcast #419 — OpenAI Board Saga, Compute Dominance & Future of AGI',
    videoId: 'jvqFAi7vkBc',
    youtubeUrl: 'https://www.youtube.com/watch?v=jvqFAi7vkBc',
    channel: 'Lex Fridman Podcast',
    durationSeconds: 278,
    keywords: [
      'lex fridman', 'sam altman', 'openai', 'agi', 'compute', 'gpt-5',
      'power', 'podcast', 'board saga', 'jvqfai7vkbc',
    ],
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        name: 'Lex Fridman',
        role: 'Host & AI Researcher',
        color: '#06B6D4',
      },
      speaker_2: {
        id: 'speaker_2',
        name: 'Sam Altman',
        role: 'CEO of OpenAI',
        color: '#F59E0B',
      },
    },
    turns: [
      {
        id: "sf-t1",
        timestamp: 0,
        endTime: 2.8,
        speakerId: "speaker_2",
        text: "I think compute is gonna be the currency of the future.",
      },
      {
        id: "sf-t2",
        timestamp: 2.8,
        endTime: 6.6,
        speakerId: "speaker_2",
        text: "I think it'll be maybe the most precious commodity in the world.",
      },
      {
        id: "sf-t3",
        timestamp: 6.6,
        endTime: 13,
        speakerId: "speaker_2",
        text: "I expect that by the end of this decade, and possibly somewhat sooner than that,",
      },
      {
        id: "sf-t4",
        timestamp: 15.4,
        endTime: 21.3,
        speakerId: "speaker_2",
        text: "we will have quite capable systems that we look at and say, wow, that's really remarkable.",
      },
      {
        id: "sf-t5",
        timestamp: 21.3,
        endTime: 24.9,
        speakerId: "speaker_2",
        text: "The road to AGI should be a giant power struggle.",
      },
      {
        id: "sf-t6",
        timestamp: 24.9,
        endTime: 26.6,
        speakerId: "speaker_2",
        text: "I expect that to be the case.",
      },
      {
        id: "sf-t7",
        timestamp: 26.6,
        endTime: 30.6,
        speakerId: "speaker_1",
        text: "Whoever builds AGI first gets a lot of power.",
      },
      {
        id: "sf-t8",
        timestamp: 32,
        endTime: 35.6,
        speakerId: "speaker_1",
        text: "Do you trust yourself with that much power?",
      },
      {
        id: "sf-t9",
        timestamp: 36.5,
        endTime: 40.1,
        speakerId: "speaker_1",
        text: "The following is a conversation with Sam Altman,",
      },
      {
        id: "sf-t10",
        timestamp: 40.1,
        endTime: 41.9,
        speakerId: "speaker_1",
        text: "his second time in the podcast.",
      },
      {
        id: "sf-t11",
        timestamp: 41.9,
        endTime: 53.7,
        speakerId: "speaker_1",
        text: "He is the CEO of OpenAI, the company behind GPT-4, ChatGPT, Sora, and perhaps one day the very company that will build AGI.",
      },
      {
        id: "sf-t12",
        timestamp: 55.6,
        endTime: 57.8,
        speakerId: "speaker_1",
        text: "This is Lex Fridman Podcast.",
      },
      {
        id: "sf-t13",
        timestamp: 57.8,
        endTime: 61.1,
        speakerId: "speaker_1",
        text: "To support it, please check out our sponsors in the description.",
      },
      {
        id: "sf-t14",
        timestamp: 61.1,
        endTime: 64.1,
        speakerId: "speaker_1",
        text: "And now, dear friends, here's Sam Altman.",
      },
      {
        id: "sf-t15",
        timestamp: 65.6,
        endTime: 73.5,
        speakerId: "speaker_1",
        text: "Take me through the OpenAI board saga that started on Thursday, November 16th, maybe Friday, November 17th for you.",
      },
      {
        id: "sf-t16",
        timestamp: 73.5,
        endTime: 90.3,
        speakerId: "speaker_2",
        text: "That was definitely the most painful professional experience of my life and chaotic, and shameful, and upsetting and a bunch of other negative things.",
      },
      {
        id: "sf-t17",
        timestamp: 90.3,
        endTime: 101.7,
        speakerId: "speaker_2",
        text: "There were great things about it too and I wish it had not been in such an adrenaline rush that I wasn't able to stop and appreciate them at the time.",
      },
      {
        id: "sf-t18",
        timestamp: 105.1,
        endTime: 120.3,
        speakerId: "speaker_2",
        text: "I came across this old tweet of mine or this tweet of mine from that time period, which was it was like kind of going to your own eulogy, watching people say all these great things about you and just like unbelievable support from people I love and care about.",
      },
      {
        id: "sf-t19",
        timestamp: 121.8,
        endTime: 123.6,
        speakerId: "speaker_2",
        text: "That was really nice.",
      },
      {
        id: "sf-t20",
        timestamp: 124.5,
        endTime: 135,
        speakerId: "speaker_2",
        text: "That whole weekend I kind of like felt with one big exception, I felt like a great deal of love and very little hate",
      },
      {
        id: "sf-t21",
        timestamp: 138.5,
        endTime: 144.1,
        speakerId: "speaker_2",
        text: "even though it felt like I have no idea what's happening and what's gonna happen here and this feels really bad.",
      },
      {
        id: "sf-t22",
        timestamp: 144.1,
        endTime: 150.6,
        speakerId: "speaker_2",
        text: "And there were definitely times I thought it was gonna be like one of the worst things to ever happen for AI safety.",
      },
      {
        id: "sf-t23",
        timestamp: 150.6,
        endTime: 155,
        speakerId: "speaker_2",
        text: "Well, I also think I'm happy that it happened relatively early.",
      },
      {
        id: "sf-t24",
        timestamp: 155,
        endTime: 164.9,
        speakerId: "speaker_2",
        text: "I thought at some point between when OpenAI started and when we created AGI, there was gonna be something crazy and explosive that happened,",
      },
      {
        id: "sf-t25",
        timestamp: 164.9,
        endTime: 179.1,
        speakerId: "speaker_2",
        text: "but there may be more crazy and explosive things happen. It still I think helped us build up some resilience and be ready for more challenges in the future.",
      },
      {
        id: "sf-t26",
        timestamp: 182.1,
        endTime: 188.7,
        speakerId: "speaker_1",
        text: "But the thing you had a sense that you would experience is some kind of power struggle.",
      },
      {
        id: "sf-t27",
        timestamp: 188.7,
        endTime: 197.2,
        speakerId: "speaker_2",
        text: "The road to AGI should be a giant power struggle. Like the world should... Well, not should. I expect that to be the case.",
      },
      {
        id: "sf-t28",
        timestamp: 197.2,
        endTime: 218.9,
        speakerId: "speaker_1",
        text: "And so you have to go through that, like you said, iterate as often as possible in figuring out how to have a board structure, how to have organization, how to have the kind of people that you're working with, how to communicate all that in order to deescalate the power struggle as much as possible, pacify it.",
      },
      {
        id: "sf-t29",
        timestamp: 218.9,
        endTime: 240.7,
        speakerId: "speaker_2",
        text: "But at this point, it feels like something that was in the past that was really unpleasant and really difficult and painful. But we're back to work and things are so busy and so intense that I don't spend a lot of time thinking about it.",
      },
      {
        id: "sf-t30",
        timestamp: 240.7,
        endTime: 259.9,
        speakerId: "speaker_2",
        text: "There was a time after. There was like this fugue state for kind of like the month after, maybe 45 days after that was I was just sort of like drifting through the days, I was so out of it. I was feeling so down",
      },
      {
        id: "sf-t31",
        timestamp: 259.9,
        endTime: 260.8,
        speakerId: "speaker_1",
        text: "Just on a personal psychological level.",
      },
      {
        id: "sf-t32",
        timestamp: 260.8,
        endTime: 272.9,
        speakerId: "speaker_2",
        text: "Yeah. Really painful. And hard to have to keep running OpenAI in the middle of that. I just wanted to crawl into a cave and kind of recover for a while.",
      },
      {
        id: "sf-t33",
        timestamp: 272.9,
        endTime: 278.5,
        speakerId: "speaker_2",
        text: "But now it's like we're just back to working on the mission.",
      },
    ],
  },
];
