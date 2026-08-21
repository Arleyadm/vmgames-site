"use strict";
/*
 * Catalogo com os 10 carros jogaveis. Porte de CarData.kt.
 *
 * Os atributos vao de 1 a 10 e viram multiplicadores de fisica no PlayerCar:
 *  speed -> velocidade maxima, accel -> aceleracao,
 *  control -> resposta da direcao e aderencia, turbo -> forca e duracao do turbo.
 *
 * IMPORTANTE: o id de cada carro tambem escolhe o sprite usado no jogo
 * (assets/img/car_0.webp ate car_9.webp).
 */
const CarCatalog = {
  cars: [
    { id: 0, name: "Raio Amarelo",       bodyColor: Cor.rgb(0xF4,0xC8,0x22), accentColor: Cor.rgb(0x20,0x20,0x24), speed: 9,  accel: 8,  control: 7,  turbo: 9,  price: 0 },
    { id: 1, name: "Azul Veloz",         bodyColor: Cor.rgb(0x2B,0x78,0xE4), accentColor: Cor.rgb(0xF2,0xF2,0xF2), speed: 8,  accel: 8,  control: 8,  turbo: 8,  price: 1800 },
    { id: 2, name: "Verde Sprint",       bodyColor: Cor.rgb(0x57,0xB9,0x35), accentColor: Cor.rgb(0x1A,0x1A,0x1E), speed: 7,  accel: 9,  control: 10, turbo: 6,  price: 3200 },
    { id: 3, name: "Titã Branco",        bodyColor: Cor.rgb(0xEC,0xEC,0xEC), accentColor: Cor.rgb(0x2A,0x2A,0x2E), speed: 7,  accel: 7,  control: 9,  turbo: 7,  price: 5200 },
    { id: 4, name: "Clássico Vermelho",  bodyColor: Cor.rgb(0xE3,0x1F,0x1F), accentColor: Cor.rgb(0xFF,0xD2,0x4D), speed: 10, accel: 9,  control: 7,  turbo: 10, price: 8000 },
    { id: 5, name: "Obsidian GT",        bodyColor: Cor.rgb(0x26,0x28,0x2C), accentColor: Cor.rgb(0xE4,0x3B,0x3B), speed: 9,  accel: 8,  control: 8,  turbo: 9,  price: 10500 },
    { id: 6, name: "Crimson RS",         bodyColor: Cor.rgb(0xE3,0x22,0x22), accentColor: Cor.rgb(0x14,0x14,0x18), speed: 8,  accel: 10, control: 8,  turbo: 8,  price: 12200 },
    { id: 7, name: "Azure Phantom",      bodyColor: Cor.rgb(0x13,0x74,0xF2), accentColor: Cor.rgb(0xE8,0xEC,0xF5), speed: 9,  accel: 8,  control: 9,  turbo: 8,  price: 14200 },
    { id: 8, name: "Solar Drift",        bodyColor: Cor.rgb(0xF3,0xC6,0x12), accentColor: Cor.rgb(0x1A,0x1E,0x24), speed: 8,  accel: 9,  control: 10, turbo: 7,  price: 16500 },
    { id: 9, name: "Frost Hyper",        bodyColor: Cor.rgb(0xF4,0xF4,0xF4), accentColor: Cor.rgb(0xE0,0x33,0x33), speed: 10, accel: 9,  control: 9,  turbo: 10, price: 19500 }
  ],

  byId(id) {
    const found = CarCatalog.cars.find(c => c.id === id);
    return found || CarCatalog.cars[0];
  }
};
window.CarCatalog = CarCatalog;
