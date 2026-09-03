"""Scientific acoustic engine extracted from the Marimo simulator.

This module intentionally contains no Marimo, plotting, or audio-device code.
Its first goal is behavioral equivalence with the current notebook model:

- shoebox room in pyroomacoustics
- uniform absorption coefficient
- image source method + ray tracing
- air absorption at 20 C and 50 % RH
- one source and five fixed receiver locations
- central receiver at index 2
- octave-band Butterworth filtering
- Schroeder EDC
- EDT, T20, T30, C50, C80, D50, and mean Lp

Once equivalence is established, the physical model can be improved in a
separate step without coupling those changes to the user interface.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Sequence

import numpy as np
import pyroomacoustics as pra
from scipy import signal


OCTAVE_BANDS_HZ: tuple[int, ...] = (125, 250, 500, 1000, 2000, 4000)
CENTRAL_RECEIVER_INDEX = 2


@dataclass(frozen=True)
class RoomConfig:
    """Inputs that currently define the Marimo room simulation."""

    width_m: float = 18.0
    length_m: float = 30.0
    height_m: float = 7.5
    absorption: float = 0.50
    max_order: int = 3
    source_power_db: float = 100.0
    analysis_frequency_hz: int = 1000
    temperature_c: float = 20.0
    humidity_percent: float = 50.0


@dataclass
class AcousticResult:
    """Numerical outputs produced by one acoustic simulation."""

    fs: int
    processed_audio: np.ndarray
    central_rir: np.ndarray
    selected_edc_db: np.ndarray
    edc_by_band_db: dict[int, np.ndarray]
    metrics: dict[str, float]
    room: pra.ShoeBox


def preprocess_audio(audio: np.ndarray) -> np.ndarray:
    """Match the notebook's basic input preprocessing.

    Converts samples to float32, collapses stereo/multichannel audio to mono by
    arithmetic mean, and peak-normalizes non-silent audio.
    """

    data = np.asarray(audio).astype(np.float32)
    if data.ndim > 1:
        data = data.mean(axis=1)

    peak = np.max(np.abs(data)) if data.size else 0.0
    if peak > 0:
        data = data / peak

    return data


def source_location(config: RoomConfig) -> np.ndarray:
    """Return the source position used by the current notebook."""

    return np.array([config.width_m / 2.0, 4.0, 1.5], dtype=float)


def receiver_locations(config: RoomConfig) -> np.ndarray:
    """Return the five receiver positions used by the current notebook.

    Shape is (3, n_receivers), matching pyroomacoustics.MicrophoneArray.
    """

    seats = [
        [4.0, 10.0, 1.2],
        [config.width_m - 4.0, 12.0, 1.2],
        [config.width_m / 2.0, 18.0, 1.2],
        [5.0, config.length_m - 5.0, 1.2],
        [config.width_m - 5.0, config.length_m - 4.0, 1.2],
    ]
    return np.asarray(seats, dtype=float).T


def build_room(audio: np.ndarray, fs: int, config: RoomConfig) -> pra.ShoeBox:
    """Build the same pyroomacoustics scene as the Marimo notebook."""

    material = pra.Material(config.absorption)
    room = pra.ShoeBox(
        [config.width_m, config.length_m, config.height_m],
        fs=fs,
        materials=material,
        max_order=config.max_order,
        air_absorption=True,
        ray_tracing=True,
        temperature=config.temperature_c,
        humidity=config.humidity_percent,
    )

    room.add_source(source_location(config), signal=audio)
    room.add_microphone_array(pra.MicrophoneArray(receiver_locations(config), fs))
    return room


def simulate_room_audio(room: pra.ShoeBox) -> np.ndarray:
    """Run the room simulation and return the normalized central-seat signal."""

    room.simulate()
    output = np.asarray(room.mic_array.signals[CENTRAL_RECEIVER_INDEX]).copy()
    peak = np.max(np.abs(output)) if output.size else 0.0
    if peak > 0:
        output = output / peak
    return output


def octave_filter(data: np.ndarray, fc_hz: float, fs: int) -> np.ndarray:
    """Apply the exact octave-band Butterworth filter used in the notebook."""

    fl = fc_hz / np.sqrt(2.0)
    fu = fc_hz * np.sqrt(2.0)
    b, a = signal.butter(
        4,
        [fl / (fs / 2.0), min(fu / (fs / 2.0), 0.99)],
        btype="bandpass",
    )
    return signal.filtfilt(b, a, data)


def schroeder_edc_db(filtered_rir: np.ndarray) -> np.ndarray:
    """Compute the normalized Schroeder energy decay curve in dB."""

    squared = np.asarray(filtered_rir) ** 2
    edc = np.cumsum(squared[::-1])[::-1]
    if edc.size == 0 or edc[0] == 0:
        return np.full_like(edc, np.nan, dtype=float)
    return 10.0 * np.log10((edc / edc[0]) + 1e-10)


def decay_time(curve_db: np.ndarray, start_db: float, end_db: float, fs: int) -> float:
    """Extrapolate a 60 dB decay time using the notebook's regression method."""

    try:
        i_start = np.where(curve_db <= start_db)[0][0]
        i_end = np.where(curve_db <= end_db)[0][0]
        slope, _ = np.polyfit(
            np.arange(i_start, i_end) / fs,
            curve_db[i_start:i_end],
            1,
        )
        return float(-60.0 / slope)
    except (IndexError, ValueError):
        return float("nan")


def room_constant(config: RoomConfig) -> float:
    """Return R = S*alpha/(1-alpha), matching the current notebook."""

    surface = 2.0 * (
        config.width_m * config.length_m
        + config.width_m * config.height_m
        + config.length_m * config.height_m
    )
    if config.absorption >= 0.99:
        return float("inf")
    return float(surface * config.absorption / (1.0 - config.absorption))


def analyze_room(
    room: pra.ShoeBox,
    fs: int,
    config: RoomConfig,
    octave_bands_hz: Sequence[int] = OCTAVE_BANDS_HZ,
    *,
    recompute_rir: bool = False,
) -> tuple[np.ndarray, dict[int, np.ndarray], dict[str, float], np.ndarray]:
    """Compute the notebook's RIR-based metrics and EDC curves.

    Returns
    -------
    selected_edc_db
        EDC of the central receiver at ``config.analysis_frequency_hz``.
    edc_by_band_db
        Central-receiver EDC for every requested octave band.
    metrics
        Mean metrics over all five receivers, matching the notebook.
    central_rir
        Full-band RIR for source 0 -> central receiver.
    """

    # room.simulate() already computes the RIR used for auralization. Reusing
    # that RIR keeps numerical metrics and audible output tied to the same
    # acoustic realization. Set recompute_rir=True only to reproduce the
    # current notebook's second compute_rir() call.
    if recompute_rir:
        room.compute_rir()

    r_const = room_constant(config)
    src = source_location(config)

    temp: dict[str, list[float]] = {
        "edt": [],
        "t20": [],
        "t30": [],
        "c50": [],
        "c80": [],
        "d50": [],
        "Lp": [],
    }

    central_rir = np.asarray(room.rir[CENTRAL_RECEIVER_INDEX][0])
    edc_by_band: dict[int, np.ndarray] = {}

    for freq in octave_bands_hz:
        rir_filtered = octave_filter(central_rir, freq, fs)
        edc_by_band[int(freq)] = schroeder_edc_db(rir_filtered)

    selected_edc = edc_by_band[int(config.analysis_frequency_hz)]

    for mic_index in range(len(room.mic_array.R.T)):
        rir_filtered = octave_filter(
            np.asarray(room.rir[mic_index][0]),
            config.analysis_frequency_hz,
            fs,
        )
        squared = rir_filtered**2
        edc_db = schroeder_edc_db(rir_filtered)

        temp["edt"].append(decay_time(edc_db, 0.0, -10.0, fs))
        temp["t20"].append(decay_time(edc_db, -5.0, -25.0, fs))
        temp["t30"].append(decay_time(edc_db, -5.0, -35.0, fs))

        n50 = int(0.05 * fs)
        n80 = int(0.08 * fs)
        e50_early = np.sum(squared[:n50])
        e50_late = np.sum(squared[n50:])
        e80_early = np.sum(squared[:n80])
        e80_late = np.sum(squared[n80:])

        temp["c50"].append(float(10.0 * np.log10(e50_early / (e50_late + 1e-10))))
        temp["d50"].append(float((e50_early / (e50_early + e50_late)) * 100.0))
        temp["c80"].append(float(10.0 * np.log10(e80_early / (e80_late + 1e-10))))

        distance = np.linalg.norm(src - room.mic_array.R[:, mic_index])
        reverberant_term = 0.0 if r_const == float("inf") else 4.0 / r_const
        lp = config.source_power_db + 10.0 * np.log10(
            (1.0 / (4.0 * np.pi * distance**2)) + reverberant_term
        )
        temp["Lp"].append(float(lp))

    metrics = {key: float(np.nanmean(values)) for key, values in temp.items()}
    return selected_edc, edc_by_band, metrics, central_rir


def simulate_acoustics(
    audio: np.ndarray,
    fs: int,
    config: RoomConfig | None = None,
    *,
    preprocess: bool = False,
    legacy_recompute_rir: bool = False,
) -> AcousticResult:
    """Run the complete acoustic pipeline used by the current Marimo model.

    Parameters
    ----------
    audio
        Dry mono audio. Set ``preprocess=True`` to apply the same conversion,
        mono fold-down, and peak normalization used when the notebook loads WAV.
    fs
        Sampling rate in Hz.
    config
        Room and analysis settings. Defaults reproduce the notebook defaults.
    preprocess
        Whether to call :func:`preprocess_audio` before simulation.
    legacy_recompute_rir
        If True, repeat ``room.compute_rir()`` after auralization exactly as
        the current Marimo notebook does. Because ray tracing is stochastic,
        False is preferred for scientific consistency: audio and metrics then
        use the same RIR realization.
    """

    cfg = config or RoomConfig()
    dry = preprocess_audio(audio) if preprocess else np.asarray(audio)
    room = build_room(dry, fs, cfg)
    processed = simulate_room_audio(room)
    selected_edc, edc_by_band, metrics, central_rir = analyze_room(
        room, fs, cfg, recompute_rir=legacy_recompute_rir
    )

    return AcousticResult(
        fs=fs,
        processed_audio=processed,
        central_rir=central_rir,
        selected_edc_db=selected_edc,
        edc_by_band_db=edc_by_band,
        metrics=metrics,
        room=room,
    )
