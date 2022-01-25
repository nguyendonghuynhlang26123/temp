import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, loadImage, Image, registerFont } from 'canvas';

//GEN CONFIGS
const WIDTH = 471;
const HEIGHT = 1038;
const SECTION_POS = [100, 100];
const ROW_POS = [245, 100];
const SEAT_POS = [380, 100];

const font = registerFont(
  path.resolve(__dirname, 'input', 'AllProDisplayA-Bold.otf'),
  {
    family: 'Font',
  },
);

const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');

//Other Configs
ctx.font = "30px 'Font'";
ctx.fillStyle = 'rgba(255,255,255,1)';
// ctx.shadowColor = 'rgba(255,255,255,0.5)';
// ctx.shadowBlur = 30;

export const genImage = async (
  output: string,
  section: string,
  row: string,
  seat: string,
) => {
  const image: Image = await loadImage(
    path.resolve(__dirname, 'input', 'layout.png'),
  );
  ctx.drawImage(image, 0, 0);

  ctx.textAlign = 'center';
  ctx.fillText('Section\tRow\tSeat', 1024, 1200);

  ctx.fillText(section, SECTION_POS[0], SECTION_POS[1]); //Section
  ctx.fillText(row, ROW_POS[0], ROW_POS[1]); //Row
  ctx.fillText(seat, SEAT_POS[0], SEAT_POS[1]); //Seat

  fs.writeFileSync(
    path.resolve(__dirname, 'output', 'images', output),
    canvas.toBuffer('image/png'),
  );
};
