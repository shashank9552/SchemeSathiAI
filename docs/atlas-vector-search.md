# MongoDB Atlas Vector Search Index Configuration

This guide provides instructions for creating the Atlas Vector Search Index for **SchemeSathi**.

---

## Index Specifications

- **Database Name:** `schemesathi` (configurable via `MONGODB_DB_NAME`)
- **Collection Name:** `scheme_chunks` (configurable via `MONGODB_COLLECTION_NAME`)
- **Index Name:** `vector_index` (configurable via `ATLAS_VECTOR_INDEX_NAME`)
- **Vector Path:** `embedding`
- **Vector Dimensions:** `768` (must match `EMBEDDING_DIMENSIONS` and `gemini-embedding-2` configured with `outputDimensionality: 768`)
- **Similarity Metric:** `cosine`
  - *Note on Score Mapping:* Atlas `$vectorSearch` with `similarity: "cosine"` computes `score = (1 + cosine) / 2`.
  - An exact match has score $1.00$; orthogonal vectors have score $0.50$.
- **Filter Fields:** `category`, `level`, `language`, `sourceFile`

---

## Step-by-Step Atlas UI Setup

1. Log into [MongoDB Atlas](https://cloud.mongodb.com/).
2. Navigate to your **Cluster** $\rightarrow$ **Atlas Search** tab (or **Search and Vector Search**).
3. Click **Create Search Index**.
4. Select **Atlas Vector Search** (JSON Editor).
5. Select your database (`schemesathi`) and collection (`scheme_chunks`).
6. Paste the following JSON definition:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 768,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "category"
    },
    {
      "type": "filter",
      "path": "level"
    },
    {
      "type": "filter",
      "path": "language"
    },
    {
      "type": "filter",
      "path": "sourceFile"
    }
  ]
}
```

7. Set the Index Name to `vector_index`.
8. Click **Create Vector Search Index**. The initial build usually takes 1–2 minutes.

---

## Querying in Aggregation Pipeline

In SchemeSathi's retrieval pipeline, vectors are queried using the `$vectorSearch` aggregation stage:

```javascript
[
  {
    $vectorSearch: {
      index: "vector_index",
      path: "embedding",
      queryVector: [...], // 768-dimensional float array
      numCandidates: 100, // at least 10x-20x top_k
      limit: 5
    }
  },
  {
    $project: {
      schemeName: 1,
      documentTitle: 1,
      sourceFile: 1,
      pageNumber: 1,
      text: 1,
      category: 1,
      level: 1,
      language: 1,
      score: { $meta: "vectorSearchScore" }
    }
  }
]
```
