import path from 'path';
import url from 'url';

console.log(path.basename(url.parse('https://dafa.com/fafa.txt?a=1').pathname!));
