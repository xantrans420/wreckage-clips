import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';
import { COLOR, FONT, MONO } from '../theme';
import { WeightLog } from '../types';

/**
 * Hand-rolled SVG trend line (kept light — no chart library). Shows the weight
 * trajectory; the scale lies during a recomp, so this is context, not verdict.
 */
export function TrendChart({ data, height = 160 }: { data: WeightLog[]; height?: number }) {
  const width = 320;
  const padL = 34;
  const padR = 8;
  const padT = 12;
  const padB = 18;

  if (data.length < 2) {
    return (
      <View style={{ height }}>
        <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <SvgText x={width / 2} y={height / 2} fill={COLOR.textFaint} fontFamily={MONO} fontSize={FONT.sm} textAnchor="middle">
            NEED 2+ WEIGH-INS FOR A TREND
          </SvgText>
        </Svg>
      </View>
    );
  }

  const kgs = data.map((d) => d.kg);
  const min = Math.min(...kgs) - 0.5;
  const max = Math.max(...kgs) + 0.5;
  const span = max - min || 1;

  const x = (i: number) => padL + (i / (data.length - 1)) * (width - padL - padR);
  const y = (kg: number) => padT + (1 - (kg - min) / span) * (height - padT - padB);

  const path = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.kg).toFixed(1)}`).join(' ');

  return (
    <View style={{ height }}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* baseline */}
        <Line x1={padL} y1={height - padB} x2={width - padR} y2={height - padB} stroke={COLOR.line} strokeWidth={1} />
        <SvgText x={2} y={y(max) + 4} fill={COLOR.textFaint} fontFamily={MONO} fontSize={9}>
          {max.toFixed(0)}
        </SvgText>
        <SvgText x={2} y={y(min) + 4} fill={COLOR.textFaint} fontFamily={MONO} fontSize={9}>
          {min.toFixed(0)}
        </SvgText>
        <Path d={path} fill="none" stroke={COLOR.accent} strokeWidth={1.5} />
        {data.map((d, i) => (
          <Circle key={d.id} cx={x(i)} cy={y(d.kg)} r={2} fill={COLOR.accent} />
        ))}
      </Svg>
    </View>
  );
}
