# Freesound Integration Guide

## Overview
The Freesound integration allows OpenCut users to search and import sound effects directly from the Freesound.org library, providing access to thousands of royalty-free audio assets.

## API Route Implementation

### File: `route.ts`
Located in this folder, this file contains the complete implementation of the Freesound search API.

### Key Features:
1. **Search Parameters Validation**: Uses Zod schemas to validate all input parameters
2. **Rate Limiting**: Prevents API abuse with built-in rate limiting
3. **License Filtering**: Automatically filters for commercially usable sounds
4. **Quality Control**: Filters by minimum rating to ensure quality results
5. **Duration Limits**: Restricts sound effects to 30 seconds maximum
6. **Tag-based Filtering**: Focuses on actual sound effects using predefined tags

## Environment Setup

### Required Environment Variables:
```bash
FREESOUND_API_KEY=your_freesound_api_key_here
```

### Getting a Freesound API Key:
1. Register at [Freesound.org](https://freesound.org)
2. Go to your account settings
3. Create a new API application
4. Copy the API key to your environment variables

## API Usage

### Endpoint:
```
GET /api/sounds/search
```

### Query Parameters:
- `q`: Search query (optional)
- `type`: "effects" | "songs" (songs not yet implemented)
- `page`: Page number (1-1000, default: 1)
- `page_size`: Results per page (1-150, default: 20)
- `sort`: "downloads" | "rating" | "created" | "score" (default: "downloads")
- `min_rating`: Minimum rating 0-5 (default: 3)
- `commercial_only`: Boolean for commercial use filtering (default: true)

### Example Request:
```javascript
fetch('/api/sounds/search?q=explosion&page=1&page_size=10&sort=rating&min_rating=4')
  .then(response => response.json())
  .then(data => console.log(data));
```

### Response Format:
```typescript
{
  count: number,           // Total number of results
  next: string | null,     // URL for next page
  previous: string | null, // URL for previous page
  results: Array<{
    id: number,
    name: string,
    description: string,
    url: string,
    previewUrl?: string,   // MP3 preview URL
    downloadUrl?: string,  // Direct download URL
    duration: number,      // Duration in seconds
    filesize: number,      // File size in bytes
    type: string,          // File type (mp3, wav, etc.)
    channels: number,      // Audio channels
    bitrate: number,       // Bitrate in kbps
    bitdepth: number,      // Bit depth
    samplerate: number,    // Sample rate in Hz
    username: string,      // Creator username
    tags: string[],        // Associated tags
    license: string,       // License type
    created: string,       // Creation date
    downloads?: number,    // Download count
    rating?: number,       // Average rating
    ratingCount?: number   // Number of ratings
  }>,
  query: string,          // Original search query
  type: string,           // Search type
  page: number,           // Current page
  pageSize: number,       // Results per page
  sort: string,           // Sort method
  minRating?: number      // Minimum rating filter
}
```

## Integration Points

### Frontend Integration:
1. Create UI components for sound search
2. Implement preview playback functionality
3. Add download/import capabilities
4. Create sound library management

### Backend Integration:
1. Store imported sounds in media library
2. Handle file downloads and processing
3. Manage user sound preferences
4. Cache frequently accessed sounds

## Error Handling

### Common Error Responses:
- `400`: Invalid parameters
- `429`: Rate limit exceeded
- `501`: Songs search not implemented
- `502`: Invalid Freesound API response
- `500`: Internal server error

### Error Response Format:
```typescript
{
  error: string,
  message?: string,
  details?: object
}
```

## Current Limitations

1. **Songs Search**: Not yet implemented (returns 501 status)
2. **Single Source**: Only Freesound.org integration
3. **Duration Limit**: 30 seconds maximum for sound effects
4. **Commercial Focus**: Primarily filters for commercial-use sounds

## Future Enhancements

1. **Multiple Sound Libraries**: Integration with other audio sources
2. **Advanced Filtering**: More granular search options
3. **User Preferences**: Saved searches and favorites
4. **Batch Operations**: Multiple file downloads
5. **AI-Powered Search**: Semantic search capabilities
6. **Sound Preview**: In-app audio playback
7. **Direct Import**: One-click addition to timeline

## Testing

### Manual Testing:
```bash
# Basic search
curl "http://localhost:3000/api/sounds/search?q=rain"

# Advanced search with filters
curl "http://localhost:3000/api/sounds/search?q=explosion&min_rating=4&commercial_only=true&sort=rating"

# Pagination
curl "http://localhost:3000/api/sounds/search?page=2&page_size=5"
```

### Integration Testing:
Ensure the following work correctly:
1. Rate limiting functionality
2. Parameter validation
3. Freesound API communication
4. Response transformation
5. Error handling scenarios

## Security Considerations

1. **API Key Protection**: Never expose Freesound API key in client-side code
2. **Rate Limiting**: Protects against abuse and API quota limits
3. **Input Validation**: Prevents injection attacks and malformed requests
4. **Error Handling**: Avoids exposing internal system details

## Performance Optimization

1. **Response Caching**: Consider caching popular search results
2. **Lazy Loading**: Implement pagination for large result sets
3. **Preview Optimization**: Use lower-quality previews for faster loading
4. **Background Downloads**: Implement async download processing