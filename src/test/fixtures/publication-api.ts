/**
 * Representative publication payloads. Shape and values follow the real
 * backend: `GET /units/{unit}/nodes` reports the unit plus its nodes in
 * `sort_order`, and `GET /nodes/{node}/preview-selection` reports one
 * selection-rule dry run.
 */
export const validUnitNodesResponse = {
  data: {
    unit: {
      id: 11,
      title: "İlk ve Orta Çağlarda Türk Dünyası",
      status: "draft",
    },
    nodes: [
      {
        id: 101,
        title: "Çalışma 1",
        type: "study",
        difficulty: "kolay",
        sort_order: 1,
        exercise_count: 6,
        status: "draft",
      },
      {
        id: 102,
        title: "Kavramları Eşleştir",
        type: "matching",
        difficulty: "orta",
        sort_order: 2,
        exercise_count: 4,
        status: "draft",
      },
      {
        id: 103,
        title: "Ünite Challenge",
        type: "unit_challenge",
        difficulty: "zor",
        sort_order: 3,
        exercise_count: 10,
        status: "draft",
      },
    ],
  },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

export const emptyUnitNodesResponse = {
  data: {
    unit: { id: 12, title: "Hazırlanıyor", status: "draft" },
    nodes: [],
  },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

/** A comfortable pass: the rule met its quota with no filter widening. */
export const passingPreviewResponse = {
  data: {
    node_id: 101,
    node_title: "Çalışma 1",
    required: 6,
    available: 9,
    relaxed: false,
    passes: true,
    message: "Yeterli (9/6).",
  },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

/** A pass the editor still needs to see: the difficulty filter was widened. */
export const relaxedPreviewResponse = {
  data: {
    node_id: 102,
    node_title: "Kavramları Eşleştir",
    required: 4,
    available: 4,
    relaxed: true,
    passes: true,
    message: "Yeterli (4/4) — ancak zorluk filtresi gevşetilerek.",
  },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

export const failingPreviewResponse = {
  data: {
    node_id: 103,
    node_title: "Ünite Challenge",
    required: 10,
    available: 3,
    relaxed: false,
    passes: false,
    message: "Kural 3 soru getiriyor, 10 gerekiyor.",
  },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

export const publishSuccessResponse = {
  data: { id: 11, status: "published", published_nodes: 3 },
  meta: { server_time: "2026-09-20T09:05:20+00:00" },
};

export const contentNotPublishableResponse = {
  error: {
    code: "CONTENT_NOT_PUBLISHABLE",
    message: "Bazı adımlar yeterli soru getirmiyor.",
    details: {
      blocking: [
        {
          node_id: 103,
          node_title: "Ünite Challenge",
          message: "Kural 3 soru getiriyor, 10 gerekiyor.",
        },
      ],
    },
  },
};
