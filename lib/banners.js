export const bannerTemplates = [
  { id: 'bloom', name: 'Electric Bloom — DJ & neon lights', image: '/images/bloom.jpg' },
  { id: 'afterhours', name: 'Afterhours — festival crowd', image: '/images/afterhours.jpg' },
  { id: 'indie', name: 'Indie — golden-hour stage', image: '/images/indie.jpg' },
  { id: 'comedy', name: 'Comedy — microphone spotlight', image: '/images/comedy.jpg' },
  { id: 'jazz', name: 'Velvet — live music', image: '/images/jazz.jpg' },
  { id: 'theatre', name: 'Theatre — dramatic stage', image: '/images/theatre.jpg' },
];

export function resolveBanner(id = 'bloom') {
  return bannerTemplates.find(template => template.id === id);
}
