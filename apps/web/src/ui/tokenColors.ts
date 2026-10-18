/** The discs a token or creature without art can wear; one is picked at random. */
export const TOKEN_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085"];

export const randomTokenColor = () => TOKEN_COLORS[Math.floor(Math.random() * TOKEN_COLORS.length)]!;
