"use strict";
/*
 * Definicao das 28 fases e dos 4 paises do World Tour. Porte de StageData.kt.
 *
 * A ordem das cores dentro de cada paleta e exatamente a mesma do Kotlin:
 * skyTop, skyBottom, grassLight, grassDark, roadLight, roadDark,
 * rumbleLight, rumbleDark, laneColor, fogColor, treeColor, mountainColor.
 */

const StageCatalog = (function () {

  const countries = [
    { name: "Brasil",          startIndex: 0,  stageCount: 10, accent: Cor.rgb(0x16, 0xA3, 0x4A) },
    { name: "Estados Unidos",  startIndex: 10, stageCount: 6,  accent: Cor.rgb(0x3B, 0x82, 0xF6) },
    { name: "Japão",           startIndex: 16, stageCount: 6,  accent: Cor.rgb(0xEF, 0x44, 0x44) },
    { name: "Itália",          startIndex: 22, stageCount: 6,  accent: Cor.rgb(0x22, 0xC5, 0x5E) }
  ];

  /** Constroi a lista de pontos do minimapa a partir de pares x,y. */
  function m() {
    const out = [];
    for (let i = 0; i < arguments.length - 1; i += 2) {
      out.push({ x: arguments[i], y: arguments[i + 1] });
    }
    return out;
  }

  function lapCountFor(countryIndex, numberInCountry) {
    // V59: nenhuma pista tem menos de 3 voltas e as finais chegam a 6 voltas.
    let laps;
    if (countryIndex === 0 && numberInCountry >= 9) laps = 6;
    else if (countryIndex === 0 && numberInCountry >= 7) laps = 5;
    else if (countryIndex === 0 && numberInCountry >= 4) laps = 4;
    else if (numberInCountry >= 6) laps = 6;
    else if (numberInCountry >= 5) laps = 5;
    else if (numberInCountry >= 3) laps = 4;
    else laps = 3;
    return limitar(laps, 3, 6);
  }

  function timeLimitForLaps(laps) {
    // V61: 3 voltas = 2:00, 4 voltas = 3:00, 5 voltas = 4:00, 6 voltas = 5:00.
    return 120 + (limitar(laps, 3, 6) - 3) * 60;
  }

  function stage(countryIndex, numberInCountry, name, colors, trafficCount, speedMin, speedMax,
                 timeLimit, length, curviness, hilliness, fuelUse, isNight, map, tunnelStyle) {
    const dynamicLaps = lapCountFor(countryIndex, numberInCountry);
    return {
      countryName: countries[countryIndex].name,
      countryIndex: countryIndex,
      numberInCountry: numberInCountry,
      name: name,
      skyTop: colors[0],
      skyBottom: colors[1],
      grassLight: colors[2],
      grassDark: colors[3],
      roadLight: colors[4],
      roadDark: colors[5],
      rumbleLight: colors[6],
      rumbleDark: colors[7],
      laneColor: colors[8],
      fogColor: colors[9],
      treeColor: colors[10],
      mountainColor: colors[11],
      trafficCount: trafficCount,
      trafficMinSpeed: speedMin,
      trafficMaxSpeed: speedMax,
      timeLimit: timeLimitForLaps(dynamicLaps),
      lengthSegments: length,
      curviness: curviness,
      hilliness: hilliness,
      laps: dynamicLaps,
      fuelUse: fuelUse,
      isNight: isNight,
      mapNodes: map,
      tunnelStyle: tunnelStyle || 0
    };
  }

  // ---------------- Paletas ----------------
  const brazilCity = [
    Cor.rgb(0x53,0x7C,0xB8), Cor.rgb(0xD5,0xE3,0xF8),
    Cor.rgb(0x42,0x93,0x4A), Cor.rgb(0x2C,0x72,0x34),
    Cor.rgb(0x68,0x6D,0x74), Cor.rgb(0x55,0x5A,0x60),
    Cor.WHITE,               Cor.rgb(0xCF,0x34,0x34),
    Cor.rgb(0xF4,0xF4,0xF4), Cor.rgb(0xD5,0xE3,0xF8),
    Cor.rgb(0x1F,0x73,0x34), Cor.rgb(0x5B,0x6D,0x8A)
  ];
  const coast = [
    Cor.rgb(0x1A,0xB8,0xD8), Cor.rgb(0xD6,0xFB,0xFF),
    Cor.rgb(0xC9,0xBD,0x72), Cor.rgb(0xB6,0xAA,0x62),
    Cor.rgb(0x72,0x74,0x79), Cor.rgb(0x65,0x67,0x6D),
    Cor.WHITE,               Cor.rgb(0xF5,0x93,0x3A),
    Cor.rgb(0xFF,0xF8,0xE5), Cor.rgb(0xD6,0xFB,0xFF),
    Cor.rgb(0x24,0xA2,0x5A), Cor.rgb(0x4C,0xC4,0xD1)
  ];
  const forest = [
    Cor.rgb(0x5C,0x8C,0x66), Cor.rgb(0xD6,0xE7,0xDC),
    Cor.rgb(0x2E,0x72,0x39), Cor.rgb(0x22,0x58,0x2D),
    Cor.rgb(0x67,0x6C,0x70), Cor.rgb(0x58,0x5D,0x61),
    Cor.rgb(0xF4,0xF4,0xF4), Cor.rgb(0x2E,0x5F,0x35),
    Cor.rgb(0xF8,0xF8,0xF8), Cor.rgb(0xC6,0xD8,0xCC),
    Cor.rgb(0x1B,0x5A,0x28), Cor.rgb(0x4A,0x67,0x4A)
  ];
  const canyon = [
    Cor.rgb(0xF0,0x92,0x43), Cor.rgb(0xFF,0xD8,0x97),
    Cor.rgb(0xC5,0x7A,0x36), Cor.rgb(0xA7,0x63,0x2C),
    Cor.rgb(0x74,0x68,0x5E), Cor.rgb(0x63,0x58,0x51),
    Cor.rgb(0xFF,0xEC,0xC8), Cor.rgb(0x8C,0x48,0x20),
    Cor.rgb(0xF8,0xE8,0xC6), Cor.rgb(0xFF,0xD8,0x97),
    Cor.rgb(0x5A,0x8E,0x40), Cor.rgb(0xC8,0x7B,0x46)
  ];
  const neon = [
    Cor.rgb(0x0D,0x08,0x28), Cor.rgb(0x32,0x11,0x4A),
    Cor.rgb(0x17,0x14,0x2C), Cor.rgb(0x0F,0x0C,0x22),
    Cor.rgb(0x2A,0x2A,0x34), Cor.rgb(0x20,0x20,0x2A),
    Cor.rgb(0x00,0xF5,0xD4), Cor.rgb(0xF5,0x00,0x90),
    Cor.rgb(0x00,0xF5,0xD4), Cor.rgb(0x25,0x0B,0x36),
    Cor.rgb(0xE5,0x1C,0xC8), Cor.rgb(0x45,0x18,0x5E)
  ];
  const snow = [
    Cor.rgb(0x78,0xB5,0xE8), Cor.rgb(0xF1,0xFB,0xFF),
    Cor.rgb(0xE7,0xF2,0xFA), Cor.rgb(0xCF,0xE4,0xEF),
    Cor.rgb(0x74,0x7B,0x85), Cor.rgb(0x63,0x6A,0x73),
    Cor.WHITE,               Cor.rgb(0x41,0x9D,0xD6),
    Cor.rgb(0xE8,0xFB,0xFF), Cor.rgb(0xF1,0xFB,0xFF),
    Cor.rgb(0x4C,0x6E,0x78), Cor.rgb(0xAD,0xC8,0xD8)
  ];
  const rainCity = [
    Cor.rgb(0x1A,0x24,0x37), Cor.rgb(0x63,0x77,0x8E),
    Cor.rgb(0x31,0x36,0x3F), Cor.rgb(0x25,0x2A,0x34),
    Cor.rgb(0x3A,0x3F,0x46), Cor.rgb(0x2F,0x34,0x3B),
    Cor.rgb(0x8F,0xE9,0xFF), Cor.rgb(0xDF,0x2F,0x5C),
    Cor.rgb(0xB9,0xF2,0xFF), Cor.rgb(0x63,0x77,0x8E),
    Cor.rgb(0x2E,0x7A,0x5A), Cor.rgb(0x43,0x50,0x64)
  ];
  const sunset = [
    Cor.rgb(0x8B,0x43,0x2F), Cor.rgb(0xFF,0xB2,0x75),
    Cor.rgb(0x48,0x7A,0x3C), Cor.rgb(0x36,0x5C,0x2E),
    Cor.rgb(0x6A,0x63,0x60), Cor.rgb(0x58,0x51,0x4E),
    Cor.rgb(0xFF,0xF0,0xD1), Cor.rgb(0xCB,0x55,0x33),
    Cor.rgb(0xFF,0xF0,0xD1), Cor.rgb(0xFF,0xB2,0x75),
    Cor.rgb(0x23,0x52,0x2A), Cor.rgb(0x7A,0x4B,0x3A)
  ];

  const stages = [
    // ---------------- BRASIL (10) ----------------
    stage(0, 1, "São Paulo Chuva", rainCity, 14, 0.54, 0.76, 210, 1050, 0.78, 0.52, 0.92, false,
      m(0.18,0.16, 0.72,0.14, 0.84,0.34, 0.70,0.54, 0.82,0.79, 0.51,0.88, 0.20,0.75, 0.12,0.42, 0.18,0.16)),
    // V88: segunda fase do Brasil e uma reta unica do inicio ao fim.
    stage(0, 2, "Rio de Janeiro", brazilCity, 16, 0.58, 0.80, 220, 1120, 0.00, 0.00, 0.96, false,
      m(0.50,0.10, 0.50,0.23, 0.50,0.36, 0.50,0.49, 0.50,0.62, 0.50,0.75, 0.50,0.90)),
    stage(0, 3, "Brasília Racing", forest, 18, 0.60, 0.83, 228, 1180, 1.22, 1.12, 1.00, false,
      m(0.23,0.18, 0.66,0.14, 0.84,0.28, 0.77,0.47, 0.88,0.70, 0.58,0.86, 0.26,0.80, 0.14,0.52, 0.23,0.18)),
    stage(0, 4, "Salvador Axé", sunset, 19, 0.61, 0.85, 235, 1210, 1.18, 1.05, 1.02, false,
      m(0.30,0.16, 0.66,0.16, 0.80,0.28, 0.78,0.48, 0.67,0.62, 0.79,0.80, 0.42,0.87, 0.18,0.67, 0.20,0.34, 0.30,0.16)),
    stage(0, 5, "Recife Pontes", brazilCity, 20, 0.62, 0.86, 238, 1240, 1.30, 0.88, 1.04, false,
      m(0.28,0.20, 0.74,0.22, 0.86,0.44, 0.70,0.82, 0.32,0.80, 0.14,0.44, 0.28,0.20)),
    stage(0, 6, "Fortaleza Beira Mar", canyon, 22, 0.64, 0.88, 244, 1280, 1.46, 1.20, 1.08, false,
      m(0.19,0.26, 0.42,0.13, 0.72,0.16, 0.84,0.39, 0.80,0.67, 0.55,0.88, 0.26,0.80, 0.14,0.56, 0.19,0.26)),
    stage(0, 7, "Manaus Amazônia", forest, 24, 0.65, 0.90, 250, 1320, 1.34, 1.18, 1.08, false,
      m(0.22,0.18, 0.62,0.12, 0.84,0.24, 0.86,0.52, 0.66,0.78, 0.34,0.86, 0.14,0.62, 0.15,0.36, 0.22,0.18)),
    stage(0, 8, "Belo Horizonte", rainCity, 25, 0.66, 0.91, 258, 1360, 1.42, 1.12, 1.10, true,
      m(0.24,0.16, 0.76,0.18, 0.82,0.44, 0.68,0.64, 0.80,0.82, 0.44,0.84, 0.20,0.66, 0.15,0.36, 0.24,0.16)),
    stage(0, 9, "Curitiba Ecológica", snow, 26, 0.67, 0.92, 268, 1400, 1.60, 1.34, 1.11, false,
      m(0.30,0.14, 0.68,0.14, 0.86,0.32, 0.78,0.58, 0.60,0.76, 0.78,0.88, 0.30,0.86, 0.12,0.52, 0.16,0.24, 0.30,0.14)),
    stage(0, 10, "Foz do Iguaçu", neon, 28, 0.69, 0.95, 282, 1480, 1.78, 1.44, 1.16, true,
      m(0.18,0.18, 0.60,0.12, 0.85,0.26, 0.80,0.52, 0.88,0.76, 0.60,0.88, 0.24,0.82, 0.12,0.52, 0.18,0.18), 1),

    // ---------------- EUA (6) ----------------
    stage(1, 1, "New York Skyline", coast, 20, 0.60, 0.84, 228, 1160, 1.00, 0.58, 0.98, false,
      m(0.22,0.24, 0.72,0.16, 0.84,0.32, 0.74,0.60, 0.84,0.82, 0.40,0.86, 0.16,0.60, 0.22,0.24)),
    stage(1, 2, "Los Angeles Hills", canyon, 22, 0.62, 0.86, 236, 1220, 1.34, 1.20, 1.03, false,
      m(0.20,0.18, 0.56,0.12, 0.80,0.24, 0.84,0.50, 0.70,0.84, 0.24,0.82, 0.12,0.48, 0.20,0.18)),
    stage(1, 3, "Las Vegas Neon", neon, 24, 0.64, 0.89, 244, 1260, 1.40, 0.92, 1.05, true,
      m(0.26,0.14, 0.76,0.18, 0.86,0.40, 0.78,0.72, 0.56,0.84, 0.20,0.78, 0.14,0.34, 0.26,0.14)),
    stage(1, 4, "San Francisco Bay", snow, 25, 0.66, 0.90, 252, 1320, 1.55, 1.38, 1.08, false,
      m(0.30,0.14, 0.68,0.12, 0.82,0.28, 0.86,0.54, 0.70,0.84, 0.30,0.86, 0.14,0.56, 0.18,0.24, 0.30,0.14)),
    stage(1, 5, "Miami Coast Run", rainCity, 26, 0.67, 0.92, 262, 1380, 1.48, 1.02, 1.10, true,
      m(0.24,0.16, 0.74,0.14, 0.84,0.34, 0.76,0.58, 0.84,0.82, 0.44,0.86, 0.18,0.62, 0.14,0.30, 0.24,0.16)),
    stage(1, 6, "Chicago Grand Prix", brazilCity, 28, 0.69, 0.95, 274, 1440, 1.70, 1.16, 1.14, false,
      m(0.16,0.26, 0.48,0.12, 0.80,0.18, 0.86,0.50, 0.72,0.86, 0.22,0.84, 0.10,0.48, 0.16,0.26)),

    // ---------------- JAPÃO (6) ----------------
    // V83: fase especial so de reta no Japao, estilo arrancada/velocidade maxima.
    stage(2, 1, "Tóquio Neon", neon, 22, 0.61, 0.87, 232, 1180, 0.00, 0.00, 1.00, true,
      m(0.50,0.12, 0.50,0.25, 0.50,0.38, 0.50,0.51, 0.50,0.64, 0.50,0.77, 0.50,0.90)),
    stage(2, 2, "Osaka Castle", snow, 23, 0.63, 0.87, 240, 1240, 1.28, 1.42, 1.04, false,
      m(0.28,0.14, 0.66,0.12, 0.82,0.26, 0.86,0.56, 0.68,0.84, 0.28,0.84, 0.12,0.50, 0.18,0.22, 0.28,0.14)),
    stage(2, 3, "Quioto Tradicional", coast, 24, 0.65, 0.89, 246, 1280, 1.24, 0.84, 1.05, false,
      m(0.20,0.24, 0.64,0.16, 0.84,0.28, 0.82,0.60, 0.58,0.82, 0.24,0.80, 0.12,0.52, 0.20,0.24)),
    stage(2, 4, "Yokohama Harbor", forest, 25, 0.66, 0.90, 252, 1320, 1.36, 1.10, 1.07, false,
      m(0.24,0.18, 0.60,0.14, 0.80,0.24, 0.84,0.46, 0.74,0.74, 0.48,0.86, 0.18,0.76, 0.12,0.42, 0.24,0.18)),
    stage(2, 5, "Sapporo Snow Tower", rainCity, 26, 0.68, 0.92, 260, 1380, 1.52, 0.96, 1.09, true,
      m(0.26,0.14, 0.74,0.14, 0.86,0.34, 0.82,0.70, 0.54,0.84, 0.20,0.78, 0.12,0.38, 0.26,0.14)),
    stage(2, 6, "Hiroshima Peace Run", neon, 28, 0.70, 0.96, 272, 1450, 1.72, 1.22, 1.15, true,
      m(0.18,0.20, 0.56,0.12, 0.82,0.20, 0.88,0.48, 0.76,0.82, 0.34,0.88, 0.12,0.56, 0.18,0.20), 1),

    // ---------------- ITÁLIA (6) ----------------
    stage(3, 1, "Roma Antica", sunset, 22, 0.62, 0.86, 234, 1200, 1.10, 0.70, 1.00, false,
      m(0.22,0.20, 0.70,0.16, 0.84,0.30, 0.80,0.56, 0.64,0.80, 0.28,0.84, 0.14,0.50, 0.22,0.20)),
    stage(3, 2, "Costa Amalfitana", coast, 23, 0.64, 0.88, 242, 1260, 1.28, 0.92, 1.04, false,
      m(0.18,0.26, 0.54,0.14, 0.80,0.20, 0.86,0.44, 0.80,0.74, 0.56,0.86, 0.22,0.80, 0.12,0.50, 0.18,0.26)),
    stage(3, 3, "Toscana Hills", forest, 24, 0.65, 0.89, 248, 1300, 1.36, 1.28, 1.06, false,
      m(0.28,0.16, 0.66,0.14, 0.82,0.28, 0.84,0.58, 0.64,0.82, 0.28,0.84, 0.12,0.52, 0.18,0.22, 0.28,0.16)),
    stage(3, 4, "Milano Temporale", rainCity, 25, 0.67, 0.91, 256, 1360, 1.46, 0.92, 1.08, true,
      m(0.24,0.16, 0.76,0.18, 0.84,0.40, 0.72,0.64, 0.84,0.82, 0.40,0.86, 0.18,0.66, 0.14,0.34, 0.24,0.16)),
    stage(3, 5, "Dolomiti Ice Run", snow, 26, 0.68, 0.93, 264, 1400, 1.60, 1.40, 1.10, false,
      m(0.30,0.14, 0.68,0.12, 0.84,0.24, 0.88,0.56, 0.72,0.86, 0.28,0.86, 0.10,0.56, 0.16,0.22, 0.30,0.14)),
    stage(3, 6, "Italia Final Trophy", neon, 28, 0.70, 0.97, 278, 1480, 1.78, 1.26, 1.15, true,
      m(0.20,0.18, 0.60,0.12, 0.84,0.22, 0.86,0.52, 0.72,0.82, 0.36,0.88, 0.14,0.60, 0.20,0.18), 1)
  ];

  return {
    countries: countries,
    stages: stages,
    count: function () { return stages.length; },
    byIndex: function (i) { return stages[limitar(Math.trunc(i), 0, stages.length - 1)]; },
    countryCount: function () { return countries.length; },
    countryByIndex: function (i) { return countries[limitar(Math.trunc(i), 0, countries.length - 1)]; },
    countryIndexForStage: function (stageIndex) {
      let found = 0;
      for (let i = 0; i < countries.length; i++) {
        if (stageIndex >= countries[i].startIndex) found = i;
      }
      return Math.max(0, found);
    },
    stagesForCountry: function (countryIndex) {
      const c = this.countryByIndex(countryIndex);
      const out = [];
      for (let i = c.startIndex; i < c.startIndex + c.stageCount; i++) {
        out.push({ index: i, stage: stages[i] });
      }
      return out;
    }
  };
})();

window.StageCatalog = StageCatalog;
