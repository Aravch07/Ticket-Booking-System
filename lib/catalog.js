export const catalog = [
  {
    id: "electric-bloom",
    title: "Electric Bloom",
    artist: "A night that feels like forever.",
    category: "Electronic",
    date: "2026-12-12T18:00:00+05:30",
    venue: "Echo Arena",
    city: "Bengaluru",
    image: "/images/bloom.jpg",
    color: "#d5fd71",
    tag: "THE ONE EVERYONE’S TALKING ABOUT",
    description:
      "Big drops. Open skies. Your favourite people. Step into a world of immersive light, heart-racing electronic music, and a crowd that moves as one.",
    lineup: ["NOVA", "Ananya × Kairo", "The Midnight Collective"],
    doors: "5:00 PM",
    duration: "5 hours",
    basePrice: 1499,
  },
  {
    id: "afterhours",
    title: "Afterhours Club",
    artist: "For the ones who stay a little longer.",
    category: "Electronic",
    date: "2026-12-19T19:00:00+05:30",
    venue: "The Warehouse",
    city: "Bengaluru",
    image: "/images/afterhours.jpg",
    color: "#b8a4f8",
    tag: "LATE NIGHTS, GOOD COMPANY",
    description:
      "An intimate warehouse session with deep house, unexpected back-to-backs, and a sound system you can feel. Leave the ordinary at the door.",
    lineup: ["DJ Sora", "Low Frequency", "B2B: Rhea & Sol"],
    doors: "6:00 PM",
    duration: "4 hours",
    basePrice: 999,
  },
  {
    id: "indie-state",
    title: "Indie State of Mind",
    artist: "Your playlist. In real life.",
    category: "Indie",
    date: "2026-12-26T17:00:00+05:30",
    venue: "Sunset Grounds",
    city: "Bengaluru",
    image: "/images/indie.jpg",
    color: "#f5b990",
    tag: "SING EVERY WORD",
    description:
      "A golden-hour gathering for the songs that got you through everything. Discover your next favourite artist, and sing along with the ones you already love.",
    lineup: ["The Paper Planes", "Ira", "Bedroom Radio"],
    doors: "4:00 PM",
    duration: "4 hours",
    basePrice: 799,
  },
  {
    id: "laugh-track",
    title: "The Laugh Track",
    artist: "Your screen-time break starts here.",
    category: "Comedy",
    date: "2026-12-05T19:30:00+05:30",
    venue: "Studio 44",
    city: "Bengaluru",
    image: "/images/comedy.jpg",
    color: "#f8d66d",
    tag: "A VERY GOOD BAD IDEA",
    description:
      "An unfiltered evening of sharp observations, wildly relatable stories, and the kind of laughter that makes your face hurt.",
    lineup: ["Aarav Mehta", "Zoya Khan", "Special guest"],
    doors: "6:45 PM",
    duration: "2 hours",
    basePrice: 599,
  },
  {
    id: "velvet-nights",
    title: "Velvet Nights",
    artist: "A little jazz. A lot of soul.",
    category: "Live music",
    date: "2027-01-09T19:00:00+05:30",
    venue: "The Conservatory",
    city: "Bengaluru",
    image: "/images/jazz.jpg",
    color: "#e6a0bd",
    tag: "SLOW DOWN. TUNE IN.",
    description:
      "Warm lights, beautiful voices, and a live band that knows exactly how to set the mood. An evening made for being present.",
    lineup: ["The Velvet Ensemble", "Maya & The Moon"],
    doors: "6:00 PM",
    duration: "3 hours",
    basePrice: 1199,
  },
  {
    id: "beyond-the-script",
    title: "Beyond the Script",
    artist: "Some stories deserve a stage.",
    category: "Theatre",
    date: "2027-01-16T18:30:00+05:30",
    venue: "The Black Box",
    city: "Bengaluru",
    image: "/images/theatre.jpg",
    color: "#8fc7db",
    tag: "LOSE YOURSELF IN A STORY",
    description:
      "A contemporary theatre double bill about the beautiful chaos of growing up, finding your people, and starting over.",
    lineup: ["Offbeat Theatre Company"],
    doors: "5:45 PM",
    duration: "2.5 hours",
    basePrice: 699,
  },
];

export const ticketClasses = [
  {
    id: "vip",
    name: "Front Row",
    label: "VIP",
    color: "#b8a4f8",
    multiplier: 2.5,
    description: "Closest to the stage. Maximum main-character energy.",
    perks: [
      "Front section seating",
      "Dedicated entry lane",
      "Complimentary welcome drink",
    ],
  },
  {
    id: "gold",
    name: "The Sweet Spot",
    label: "GOLD",
    color: "#f4ca78",
    multiplier: 1.6,
    description: "The perfect view. Right in the heart of it all.",
    perks: [
      "Central bowl seating",
      "Balanced stage views",
      "Access to food & beverage stalls",
    ],
  },
  {
    id: "silver",
    name: "Good Vibes",
    label: "SILVER",
    color: "#8fc7db",
    multiplier: 1,
    description: "Take it all in. The full experience, your way.",
    perks: [
      "Upper bowl seating",
      "Panoramic stage views",
      "Access to food & beverage stalls",
    ],
  },
];

export function seatLayout() {
  const seats = [];
  for (let row = 0; row < 9; row++) {
    const count = 24 + row * 4;
    const cls = row < 3 ? "vip" : row < 6 ? "gold" : "silver";
    let number = 0;
    for (let j = 0; j < count; j++) {
      if (Math.abs(j - count / 3) < 1 || Math.abs(j - (2 * count) / 3) < 1)
        continue;
      const angle = 12 + (j / (count - 1)) * 156;
      const radians = (angle * Math.PI) / 180;
      number++;
      seats.push({
        id: `${String.fromCharCode(65 + row)}${String(number).padStart(2, "0")}`,
        row: String.fromCharCode(65 + row),
        number,
        classId: cls,
        x: +(420 + Math.cos(radians) * (181 + row * 25)).toFixed(2),
        y: +(100 + Math.sin(radians) * (145 + row * 25)).toFixed(2),
        rotation: +(angle - 90).toFixed(2),
      });
    }
  }
  return seats;
}
