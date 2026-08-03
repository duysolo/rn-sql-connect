# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { getMovieById, listMoviesByGenre, getMyReviews, createMovie, updateMovie, deleteMovie } from '@dataconnect/example';


// Operation GetMovieById:  For variables, look at type GetMovieByIdVars in ../index.d.ts
const { data } = await GetMovieById(dataConnect, getMovieByIdVars);

// Operation ListMoviesByGenre:  For variables, look at type ListMoviesByGenreVars in ../index.d.ts
const { data } = await ListMoviesByGenre(dataConnect, listMoviesByGenreVars);

// Operation GetMyReviews: 
const { data } = await GetMyReviews(dataConnect);

// Operation CreateMovie:  For variables, look at type CreateMovieVars in ../index.d.ts
const { data } = await CreateMovie(dataConnect, createMovieVars);

// Operation UpdateMovie:  For variables, look at type UpdateMovieVars in ../index.d.ts
const { data } = await UpdateMovie(dataConnect, updateMovieVars);

// Operation DeleteMovie:  For variables, look at type DeleteMovieVars in ../index.d.ts
const { data } = await DeleteMovie(dataConnect, deleteMovieVars);


```