import { ticketClasses } from './catalog.js';

export const venueLayouts = [
  { id: 'arena', label: 'Arena bowl', example: 'Echo Arena', description: 'Curved seating around a central stage' },
  { id: 'stadium', label: 'Stadium grandstand', example: 'City Stadium', description: 'Wide tiered stands for a big-stage show' },
  { id: 'theatre', label: 'Theatre hall', example: 'Studio 44', description: 'Straight, front-facing rows' },
  { id: 'amphitheatre', label: 'Open-air amphitheatre', example: 'Sunset Grounds', description: 'Wide fan-shaped outdoor rows' },
];

export const sectionTypes = [
  ...ticketClasses.map(({ id, label, name, color, description, perks }) => ({ id, label, name, color, description, perks })),
  { id: 'general', label: 'GENERAL', name: 'Main Floor', color: '#d5fd71', description: 'The shared energy of the main floor.', perks: ['Full show access', 'Main floor seating'] },
  { id: 'balcony', label: 'BALCONY', name: 'The View', color: '#e8aa83', description: 'See the whole scene from above.', perks: ['Elevated stage view', 'Full show access'] },
];

export const defaultSections = [
  { id: 'vip', name: 'Front Row', rows: 3, seatsPerRow: 24, price: 1998 },
  { id: 'gold', name: 'The Sweet Spot', rows: 3, seatsPerRow: 34, price: 1278 },
  { id: 'silver', name: 'Good Vibes', rows: 3, seatsPerRow: 40, price: 799 },
];

// Shared by the preview and server. Invalid input never reaches SQL.
export function prepareVenue(layoutId, submitted) {
  const layout = venueLayouts.find(item => item.id === layoutId);
  if (!layout) throw new Error('Choose an available venue layout.');
  if (!Array.isArray(submitted) || submitted.length < 1 || submitted.length > 5)
    throw new Error('Choose between one and five ticket sections.');
  const seen = new Set();
  let totalRows = 0;
  const sections = submitted.map(item => {
    const type = sectionTypes.find(option => option.id === item?.id);
    if (!type || seen.has(type.id)) throw new Error('Each ticket type can be selected only once.');
    seen.add(type.id);
    const name = String(item.name || '').trim();
    const rows = Number(item.rows), seatsPerRow = Number(item.seatsPerRow), price = Number(item.price);
    if (name.length < 2 || name.length > 40) throw new Error(`${type.label} section name must be 2–40 characters.`);
    if (!Number.isInteger(rows) || rows < 1 || rows > 9) throw new Error(`${type.label} needs 1–9 rows.`);
    if (!Number.isInteger(seatsPerRow) || seatsPerRow < 8 || seatsPerRow > 40) throw new Error(`${type.label} needs 8–40 seats per row.`);
    if (!Number.isInteger(price) || price < 100 || price > 100000) throw new Error(`${type.label} price must be ₹100–₹1,00,000.`);
    totalRows += rows;
    return { ...type, name, rows, seatsPerRow, price };
  });
  if (totalRows > 9) throw new Error('This venue map supports at most nine rows across all sections.');
  const seats = [];
  let rowIndex = 0;
  for (const section of sections) {
    for (let r = 0; r < section.rows; r++, rowIndex++) {
      const row = String.fromCharCode(65 + rowIndex), count = section.seatsPerRow;
      for (let i = 0; i < count; i++) {
        let x, y, rotation;
        if (layout.id === 'theatre') {
          x = 115 + i * 610 / Math.max(1, count - 1);
          y = 194 + rowIndex * 27;
          rotation = 0;
        } else if (layout.id === 'stadium') {
          const normalized = (i / Math.max(1, count - 1)) * 2 - 1;
          x = 420 + normalized * 325;
          y = 184 + rowIndex * 27 + normalized * normalized * 18;
          rotation = normalized * 8;
        } else {
          const angle = (layout.id === 'amphitheatre' ? 24 : 10) + i * (layout.id === 'amphitheatre' ? 132 : 160) / Math.max(1, count - 1);
          const radians = angle * Math.PI / 180;
          const radius = (layout.id === 'amphitheatre' ? 200 : 185) + rowIndex * (layout.id === 'amphitheatre' ? 18 : 17);
          x = 420 + Math.cos(radians) * radius;
          y = 108 + Math.sin(radians) * (150 + rowIndex * 20);
          rotation = angle - 90;
        }
        seats.push({ id: `${row}${String(i + 1).padStart(2, '0')}`, row, number: i + 1, classId: section.id,
          x: +x.toFixed(2), y: +y.toFixed(2), rotation: +rotation.toFixed(2) });
      }
    }
  }
  return { layout, sections, seats, capacity: seats.length, totalRows };
}
