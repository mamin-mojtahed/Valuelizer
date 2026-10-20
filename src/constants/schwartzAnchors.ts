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
    startAngle: -18,
    endAngle: 72,
    color: 'rgba(6, 182, 212, 0.14)',
    strokeColor: '#06B6D4',
    description: 'Independent thought, action, readiness for change, novelty, and pleasure.',
  },
  {
    id: HigherOrderDomain.SELF_ENHANCEMENT,
    name: 'Self-Enhancement',
    startAngle: 72,
    endAngle: 162,
    color: 'rgba(245, 158, 11, 0.14)',
    strokeColor: '#F59E0B',
    description: 'Pursuit of personal success, ambition, social status, prestige, and dominance over resources.',
  },
  {
    id: HigherOrderDomain.CONSERVATION,
    name: 'Conservation',
    startAngle: 162,
    endAngle: 270,
    color: 'rgba(99, 102, 241, 0.14)',
    strokeColor: '#6366F1',
    description: 'Order, self-restriction, preservation of traditional practices, and protection of stability.',
  },
  {
    id: HigherOrderDomain.SELF_TRANSCENDENCE,
    name: 'Self-Transcendence',
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
    durationSeconds: 195,
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
        endTime: 12,
        speakerId: 'speaker_1',
        text: 'If every atom in the universe follows deterministic physical laws established at the Big Bang, does individual human free will genuinely exist, or is it merely an evolutionary illusion?',
      },
      {
        id: 'fw-t2',
        timestamp: 12,
        endTime: 24,
        speakerId: 'speaker_2',
        text: 'From strict Newtonian mechanics, if you know the positions and velocities of all particles, every future state is predetermined, meaning our decisions could just be predictable physics.',
      },
      {
        id: 'fw-t3',
        timestamp: 24,
        endTime: 36,
        speakerId: 'speaker_1',
        text: 'That implies when I decide between tea and coffee, quantum interactions and chemical firings in my brain were already set in motion billions of years ago.',
      },
      {
        id: 'fw-t4',
        timestamp: 36,
        endTime: 48,
        speakerId: 'speaker_2',
        text: 'However, quantum mechanics introduces fundamental probabilistic indeterminacy at microscopic scales, disrupting strict classical determinism.',
      },
      {
        id: 'fw-t5',
        timestamp: 48,
        endTime: 60,
        speakerId: 'speaker_1',
        text: 'Yet randomness is not the same as conscious self-direction; if my choices are dictated by rolling dice at the subatomic level, that still isn’t my deliberate will.',
      },
      {
        id: 'fw-t6',
        timestamp: 60,
        endTime: 72,
        speakerId: 'speaker_2',
        text: 'I view free will as an emergent phenomenon of macroscopic biological complexity, much like how wetness emerges from hydrogen and oxygen without being a property of single molecules.',
      },
      {
        id: 'fw-t7',
        timestamp: 72,
        endTime: 84,
        speakerId: 'speaker_1',
        text: 'If society officially acknowledged that free will does not exist, would our judicial system and moral accountability completely collapse?',
      },
      {
        id: 'fw-t8',
        timestamp: 84,
        endTime: 96,
        speakerId: 'speaker_2',
        text: 'Society requires the operational premise of personal responsibility to maintain public security, ethical norms, and mutual social cooperation.',
      },
      {
        id: 'fw-t9',
        timestamp: 96,
        endTime: 108,
        speakerId: 'speaker_1',
        text: 'So even if physics ultimately disproves volition, believing in human agency remains essential for universal justice and human dignity.',
      },
      {
        id: 'fw-t10',
        timestamp: 108,
        endTime: 120,
        speakerId: 'speaker_2',
        text: 'Precisely, because evaluating moral choices empowers individuals to cultivate benevolence and empathy toward their fellow humans.',
      },
      {
        id: 'fw-t11',
        timestamp: 120,
        endTime: 132,
        speakerId: 'speaker_1',
        text: 'Scientific curiosity compels us to fearlessly pursue truth about cosmic mechanics, regardless of whether it comforts our philosophical traditions.',
      },
      {
        id: 'fw-t12',
        timestamp: 132,
        endTime: 144,
        speakerId: 'speaker_2',
        text: 'Honoring both relentless scientific inquiry and the societal institutions that safeguard human well-being is how science elevates civilization.',
      },
      {
        id: 'fw-t13',
        timestamp: 144,
        endTime: 156,
        speakerId: 'speaker_1',
        text: 'Every calculation we make expands human understanding and unlocks our mastery over physical reality.',
      },
      {
        id: 'fw-t14',
        timestamp: 156,
        endTime: 168,
        speakerId: 'speaker_2',
        text: 'And preserving humility before the mysteries of consciousness ensures we never reduce human purpose to mere mechanical equations.',
      },
      {
        id: 'fw-t15',
        timestamp: 168,
        endTime: 180,
        speakerId: 'speaker_1',
        text: 'Whether predetermined or freely willed, our shared pursuit of knowledge defines the highest achievement of the human intellect.',
      },
      {
        id: 'fw-t16',
        timestamp: 180,
        endTime: 195,
        speakerId: 'speaker_2',
        text: 'And our capacity to care for one another within this vast universe gives our existence its true, enduring meaning.',
      },
    ],
  },
  {
    id: 'ubi-political-philosophy',
    title: 'Universal Basic Income & The Social Contract: Egalitarian Floor vs. Meritocratic Dynamism',
    subtitle: 'Political Philosophy Roundtable on Automation, Dignity & Economic Freedom',
    videoId: 'sGYl17DiEwo',
    youtubeUrl: 'https://www.youtube.com/watch?v=sGYl17DiEwo',
    channel: 'Institute for Economic & Political Philosophy',
    durationSeconds: 180,
    keywords: [
      'universal basic income', 'ubi', 'political philosophy', 'roundtable', 'capitalism',
      'equality', 'welfare', 'meritocracy', 'andrew yang', 'milton friedman',
    ],
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        name: 'Prof. Elena Rostova',
        role: 'Egalitarian Social Philosopher',
        color: '#06B6D4',
      },
      speaker_2: {
        id: 'speaker_2',
        name: 'Marcus Vance',
        role: 'Classical Market Economist',
        color: '#F59E0B',
      },
    },
    turns: [
      {
        id: 'ubi-t1',
        timestamp: 0,
        endTime: 15,
        speakerId: 'speaker_1',
        text: 'A guaranteed Universal Basic Income recognizes that every human being possesses inherent dignity. By decoupling survival from coercive wage labor, we liberate citizens to care for their families, pursue creative arts, and strengthen community solidarity.',
      },
      {
        id: 'ubi-t2',
        timestamp: 15,
        endTime: 30,
        speakerId: 'speaker_2',
        text: 'Productive achievement, personal mastery, and disciplined contribution are the bedrock of both economic prosperity and individual self-respect. Rewarding detachment from work erodes the cultural ethic of competence and ambition.',
      },
      {
        id: 'ubi-t3',
        timestamp: 30,
        endTime: 45,
        speakerId: 'speaker_1',
        text: 'That view reduces human worth to market output. In an era of AI automation, hoarding capital wealth among a tiny elite while millions face economic insecurity violates basic distributive justice and social harmony.',
      },
      {
        id: 'ubi-t4',
        timestamp: 45,
        endTime: 60,
        speakerId: 'speaker_2',
        text: 'Centralized state redistribution expands bureaucratic authority and fiscal control over citizens. When individuals earn resources through competitive enterprise and risk-taking, society achieves far higher innovation and material abundance.',
      },
      {
        id: 'ubi-t5',
        timestamp: 60,
        endTime: 75,
        speakerId: 'speaker_1',
        text: 'On the contrary, an unconditional cash floor eliminates paternalistic welfare bureaucracy! It grants every person true self-direction—the freedom to say no to exploitative conditions, start a local cooperative, or enjoy leisure and family life.',
      },
      {
        id: 'ubi-t6',
        timestamp: 75,
        endTime: 90,
        speakerId: 'speaker_2',
        text: 'Wait—elevating leisure and sensory comfort over duty and institutional continuity weakens the social fabric. Time-tested traditions of reciprocity require that able citizens contribute before claiming collective output.',
      },
      {
        id: 'ubi-t7',
        timestamp: 90,
        endTime: 105,
        speakerId: 'speaker_1',
        text: 'What about unpaid caregiving, parenting, and ecological restoration? Markets assign zero price to the benevolence and compassion that actually hold our neighborhoods and biosphere together.',
      },
      {
        id: 'ubi-t8',
        timestamp: 105,
        endTime: 120,
        speakerId: 'speaker_2',
        text: 'Strong families and civic institutions are vital, I agree, and we must protect national fiscal stability and rule of law. Deficit-funded universal payouts risk sovereign debt crises that destroy the security of savers and workers alike.',
      },
      {
        id: 'ubi-t9',
        timestamp: 120,
        endTime: 135,
        speakerId: 'speaker_1',
        text: 'A sovereign dividend funded by taxing planetary carbon emissions and shared technological commons protects nature while guaranteeing universal equity for every citizen.',
      },
      {
        id: 'ubi-t10',
        timestamp: 135,
        endTime: 150,
        speakerId: 'speaker_2',
        text: 'Punishing high-performing builders and capital allocators with confiscatory taxes stifles the exact entrepreneurial breakthroughs needed to solve energy and scarcity challenges.',
      },
      {
        id: 'ubi-t11',
        timestamp: 150,
        endTime: 165,
        speakerId: 'speaker_1',
        text: 'True civilization is measured not by the power of its billionaires, but by the security, creative liberty, and well-being of its most vulnerable members.',
      },
      {
        id: 'ubi-t12',
        timestamp: 165,
        endTime: 180,
        speakerId: 'speaker_2',
        text: 'And enduring prosperity requires honoring meritocratic excellence, fiscal discipline, and the proven institutional norms that incentivize human achievement.',
      },
    ],
  },
  {
    id: 'founder-deep-tech',
    title: 'Sam Altman & Lex Fridman: AGI Scaling, Sovereign Compute & Human Meaning',
    subtitle: 'Deep-Tech Founder Interview on Ambition, Power Concentration & Planetary Futures',
    videoId: 'jvqFAi7vkBc',
    youtubeUrl: 'https://www.youtube.com/watch?v=jvqFAi7vkBc',
    channel: 'Lex Fridman Podcast',
    durationSeconds: 180,
    keywords: [
      'lex fridman', 'sam altman', 'startup founder', 'openai', 'agi', 'compute',
      'ambition', 'interview', 'debate',
    ],
    speakers: {
      speaker_1: {
        id: 'speaker_1',
        name: 'Lex Fridman',
        role: 'Host & Philosophical Inquirer',
        color: '#06B6D4',
      },
      speaker_2: {
        id: 'speaker_2',
        name: 'Sam Altman',
        role: 'Frontier AI Founder & CEO',
        color: '#F59E0B',
      },
    },
    turns: [
      {
        id: 'sf-t1',
        timestamp: 0,
        endTime: 15,
        speakerId: 'speaker_1',
        text: 'When one organization races toward artificial general intelligence, there is a profound tension between the thrill of scientific discovery and the terrifying concentration of power over human destiny. How do you guard against hubris?',
      },
      {
        id: 'sf-t2',
        timestamp: 15,
        endTime: 30,
        speakerId: 'speaker_2',
        text: 'We are driven by a relentless conviction that scaling intelligence and energy abundance is the highest-leverage achievement humanity can pursue. Standing still out of fear leaves human suffering and scarcity unsolved.',
      },
      {
        id: 'sf-t3',
        timestamp: 30,
        endTime: 45,
        speakerId: 'speaker_1',
        text: 'Yet meaning often comes from struggle, sacred traditions, deep personal empathy, and the quiet beauty of human connection—not merely maximizing compute throughput or industrial power.',
      },
      {
        id: 'sf-t4',
        timestamp: 45,
        endTime: 60,
        speakerId: 'speaker_2',
        text: 'I believe people want agency and self-direction. If we build tools that radically amplify individual capability, every person gains the freedom to create, explore bold frontiers, and achieve extraordinary goals.',
      },
      {
        id: 'sf-t5',
        timestamp: 60,
        endTime: 75,
        speakerId: 'speaker_1',
        text: 'What happens when deployment velocity outpaces societal stability? Shouldn’t frontier labs submit to strict transparent audits, democratic conformity, and independent safety verification before releasing next-generation systems?',
      },
      {
        id: 'sf-t6',
        timestamp: 75,
        endTime: 90,
        speakerId: 'speaker_2',
        text: 'Iterative deployment in the real world is how society adapts safely. Locking technology away in secret for decades and then dropping a superintelligence on an unprepared world would be far more destabilizing.',
      },
      {
        id: 'sf-t7',
        timestamp: 90,
        endTime: 105,
        speakerId: 'speaker_1',
        text: 'Still, critics worry that competitive boardroom dynamics prioritize market dominance, valuation, and strategic control over humble openness and community trust.',
      },
      {
        id: 'sf-t8',
        timestamp: 105,
        endTime: 120,
        speakerId: 'speaker_2',
        text: 'To build planet-scale infrastructure requires unprecedented capital mobilization and decisive executive leadership. You cannot build multi-gigawatt compute clusters without ambitious scale and disciplined execution.',
      },
      {
        id: 'sf-t9',
        timestamp: 120,
        endTime: 135,
        speakerId: 'speaker_1',
        text: 'And for the billions of ordinary people watching this transformation—how do we preserve human benevolence, kindness, and universal solidarity so no one feels obsolete?',
      },
      {
        id: 'sf-t10',
        timestamp: 135,
        endTime: 150,
        speakerId: 'speaker_2',
        text: 'Humans are wired to care about other humans, to seek joy, play, and status, and to pioneer new adventures. Even when intelligence is abundant, our desire for human connection and novel experiences will flourish.',
      },
      {
        id: 'sf-t11',
        timestamp: 150,
        endTime: 165,
        speakerId: 'speaker_1',
        text: 'Perhaps the ultimate test of wisdom is whether we can pair radical technological stimulation with deep moral humility, protecting both planetary survival and the sanctity of the human spirit.',
      },
      {
        id: 'sf-t12',
        timestamp: 165,
        endTime: 180,
        speakerId: 'speaker_2',
        text: 'If we get alignment and global safety governance right while pushing the frontier of competence and discovery, the future will be more vibrant, free, and prosperous than anything in history.',
      },
    ],
  },
];
