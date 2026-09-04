from __future__ import annotations

import numpy as np

from app.acoustic_engine import (
    CENTRAL_RECEIVER_INDEX,
    OCTAVE_BANDS_HZ,
    RoomConfig,
    analyze_room,
    build_room,
    octave_filter,
    preprocess_audio,
    receiver_locations,
    schroeder_edc_db,
    simulate_room_audio,
    source_location,
)


def legacy_decay_time(curve, u_in, u_fin, fs):
    try:
        i_in = np.where(curve <= u_in)[0][0]
        i_fin = np.where(curve <= u_fin)[0][0]
        m, _ = np.polyfit(np.arange(i_in, i_fin) / fs, curve[i_in:i_fin], 1)
        return -60.0 / m
    except IndexError:
        return np.nan


def legacy_analysis(room, fs, cfg):
    from scipy import signal

    def filtro_octava(data, fc):
        fl, fu = fc / np.sqrt(2), fc * np.sqrt(2)
        b, a = signal.butter(
            4,
            [fl / (fs / 2), min(fu / (fs / 2), 0.99)],
            btype="bandpass",
        )
        return signal.filtfilt(b, a, data)

    S = 2 * (
        cfg.width_m * cfg.length_m
        + cfg.width_m * cfg.height_m
        + cfg.length_m * cfg.height_m
    )
    alpha = cfg.absorption
    R_sala = (S * alpha) / (1 - alpha) if alpha < 0.99 else float("inf")
    src_loc = np.array([cfg.width_m / 2, 4.0, 1.5])

    temp = {"edt": [], "t20": [], "t30": [], "c50": [], "c80": [], "d50": [], "Lp": []}
    curvas = {}
    rir_central = room.rir[2][0]

    for f in OCTAVE_BANDS_HZ:
        rir_filt = filtro_octava(rir_central, f)
        sq = rir_filt**2
        edc = np.cumsum(sq[::-1])[::-1]
        curvas[f] = 10 * np.log10((edc / edc[0]) + 1e-10)

    selected = curvas[cfg.analysis_frequency_hz]

    for i in range(len(room.mic_array.R.T)):
        rir_filt = filtro_octava(room.rir[i][0], cfg.analysis_frequency_hz)
        sq = rir_filt**2
        edc = np.cumsum(sq[::-1])[::-1]
        edc_db = 10 * np.log10((edc / edc[0]) + 1e-10)

        temp["edt"].append(legacy_decay_time(edc_db, 0, -10, fs))
        temp["t20"].append(legacy_decay_time(edc_db, -5, -25, fs))
        temp["t30"].append(legacy_decay_time(edc_db, -5, -35, fs))

        e50_t, e50_l = np.sum(sq[: int(0.05 * fs)]), np.sum(sq[int(0.05 * fs) :])
        e80_t, e80_l = np.sum(sq[: int(0.08 * fs)]), np.sum(sq[int(0.08 * fs) :])
        temp["c50"].append(10 * np.log10(e50_t / (e50_l + 1e-10)))
        temp["d50"].append((e50_t / (e50_t + e50_l)) * 100)
        temp["c80"].append(10 * np.log10(e80_t / (e80_l + 1e-10)))

        r = np.linalg.norm(src_loc - room.mic_array.R[:, i])
        Lp = cfg.source_power_db + 10 * np.log10(
            (1 / (4 * np.pi * r**2)) + (4 / R_sala if R_sala != float("inf") else 0)
        )
        temp["Lp"].append(Lp)

    metrics = {k: np.nanmean(v) for k, v in temp.items()}
    return selected, curvas, metrics, np.asarray(rir_central)


def test_preprocess_matches_notebook_behavior():
    stereo = np.array([[1, 3], [-2, -4], [0, 0]], dtype=np.int16)
    result = preprocess_audio(stereo)
    expected = np.array([2.0, -3.0, 0.0], dtype=np.float32) / 3.0
    np.testing.assert_allclose(result, expected)


def test_geometry_matches_notebook_defaults():
    cfg = RoomConfig()
    np.testing.assert_allclose(source_location(cfg), [9.0, 4.0, 1.5])
    np.testing.assert_allclose(
        receiver_locations(cfg),
        np.array(
            [
                [4.0, 14.0, 9.0, 5.0, 13.0],
                [10.0, 12.0, 18.0, 25.0, 26.0],
                [1.2, 1.2, 1.2, 1.2, 1.2],
            ]
        ),
    )


def test_extracted_analysis_matches_legacy_equations():
    # Short broadband impulse is enough to produce a room response while
    # keeping the regression test reasonably fast.
    fs = 16000
    audio = np.zeros(fs // 10, dtype=np.float32)
    audio[0] = 1.0
    cfg = RoomConfig(max_order=1, analysis_frequency_hz=1000)

    room = build_room(audio, fs, cfg)
    processed = simulate_room_audio(room)

    assert processed.ndim == 1
    assert np.max(np.abs(processed)) <= 1.0 + 1e-12
    assert len(room.mic_array.signals) == 5

    selected_new, curves_new, metrics_new, rir_new = analyze_room(room, fs, cfg, recompute_rir=False)
    selected_old, curves_old, metrics_old, rir_old = legacy_analysis(room, fs, cfg)

    np.testing.assert_allclose(rir_new, rir_old, rtol=0, atol=0)
    np.testing.assert_allclose(selected_new, selected_old, rtol=1e-12, atol=1e-12, equal_nan=True)

    for freq in OCTAVE_BANDS_HZ:
        np.testing.assert_allclose(
            curves_new[freq], curves_old[freq], rtol=1e-12, atol=1e-12, equal_nan=True
        )

    for key in metrics_old:
        np.testing.assert_allclose(
            metrics_new[key], metrics_old[key], rtol=1e-12, atol=1e-12, equal_nan=True
        )


def test_scaled_geometry_stays_inside_small_room_preset():
    cfg = RoomConfig(width_m=7.0, length_m=10.0, height_m=3.5)
    src = source_location(cfg)
    mics = receiver_locations(cfg)
    assert np.all(src > 0)
    assert src[0] < cfg.width_m and src[1] < cfg.length_m and src[2] < cfg.height_m
    assert np.all(mics[0] > 0) and np.all(mics[0] < cfg.width_m)
    assert np.all(mics[1] > 0) and np.all(mics[1] < cfg.length_m)
    assert np.all(mics[2] > 0) and np.all(mics[2] < cfg.height_m)
