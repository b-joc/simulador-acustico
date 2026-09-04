(() => {
  'use strict';

  // Presets are UI configuration only. They do not calculate acoustics.
  // Acoustic results are always requested from the Python API.
  window.ACOUSTIC_PRESETS = {
    rooms: [
      {
        id: 'classroom',
        label: 'Aula de clase',
        width: 8,
        length: 10,
        height: 3,
        description: 'Recinto compacto para explorar condiciones típicas de enseñanza y palabra hablada.'
      },
      {
        id: 'conference',
        label: 'Sala de conferencias',
        width: 12,
        length: 16,
        height: 4,
        description: 'Volumen moderado orientado a presentaciones, reuniones y reproducción de voz.'
      },
      {
        id: 'studio',
        label: 'Estudio de grabación',
        width: 7,
        length: 10,
        height: 3.5,
        description: 'Espacio pequeño para contrastar tratamientos acústicos con una geometría controlada.'
      },
      {
        id: 'small-concert',
        label: 'Sala de conciertos pequeña',
        width: 16,
        length: 24,
        height: 8,
        description: 'Recinto musical de volumen intermedio para observar el compromiso entre claridad y reverberación.'
      },
      {
        id: 'tec-arts',
        label: 'Centro de las Artes, TEC',
        width: 18,
        length: 30,
        height: 7.5,
        description: 'Geometría rectangular de referencia utilizada en el desarrollo inicial del simulador.'
      },
      {
        id: 'large-auditorium',
        label: 'Auditorio grande',
        width: 24,
        length: 42,
        height: 11,
        description: 'Gran volumen escénico para estudiar colas reverberantes más extensas.'
      },
      {
        id: 'cathedral',
        label: 'Catedral / iglesia',
        width: 22,
        length: 48,
        height: 14,
        description: 'Volumen alto que permite explorar escenarios de reverberación prolongada.'
      }
    ],
    materials: [
      {
        id: 'concrete-glass',
        label: 'Concreto / vidrio',
        absorption: 0.05,
        description: 'Preset uniforme muy reflectante. Los materiales reales dependen fuertemente de la frecuencia.'
      },
      {
        id: 'plaster',
        label: 'Yeso / mampostería pintada',
        absorption: 0.10,
        description: 'Preset uniforme reflectante para estudiar decaimientos relativamente lentos.'
      },
      {
        id: 'wood',
        label: 'Madera',
        absorption: 0.15,
        description: 'Valor didáctico uniforme para un escenario parcialmente reflectante.'
      },
      {
        id: 'occupied-seats',
        label: 'Butacas tapizadas (ocupado)',
        absorption: 0.50,
        description: 'Preset de absorción intermedia-alta para representar de forma simplificada una sala ocupada.'
      },
      {
        id: 'carpet-curtains',
        label: 'Alfombra + cortinas',
        absorption: 0.60,
        description: 'Preset uniforme absorbente para estudiar una reducción apreciable de la energía reflejada.'
      },
      {
        id: 'porous-panels',
        label: 'Paneles acústicos porosos',
        absorption: 0.80,
        description: 'Preset de absorción alta para explorar un recinto fuertemente tratado.'
      },
      {
        id: 'treated-studio',
        label: 'Estudio tratado',
        absorption: 0.95,
        description: 'Límite didáctico de absorción muy alta, cercano al extremo del modelo uniforme.'
      }
    ]
  };
})();
