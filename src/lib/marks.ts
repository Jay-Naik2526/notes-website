/** Personal annotations, stored on the visitor's own device (never uploaded). Coordinates are fractions of the page. */
export type MarkColor = 'y' | 'g' | 'p';

export type Highlight = { id: string; k: 'h'; p: number; x: number; y: number; w: number; h: number; c: MarkColor };
export type Note = { id: string; k: 'n'; p: number; x: number; y: number; t: string };
export type Mark = Highlight | Note;

export const COLORS: Record<MarkColor, { name: string; css: string }> = {
	y: { name: 'Yellow', css: '#f3d54a' },
	g: { name: 'Green', css: '#7fd38a' },
	p: { name: 'Pink', css: '#f08fb4' }
};

export const uid = () => Math.random().toString(36).slice(2, 9);
