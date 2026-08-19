import type { CalcRuler } from '../../lib/calc/result';
import { strings } from '../../strings';

interface BitRulerProps {
  ruler: CalcRuler;
  family: 4 | 6;
}

/**
 * NetCarve's signature element: the address laid out cell by cell with a hard rule where the
 * network bits stop and the host bits begin. IPv4 shows 32 bits grouped into octets; IPv6
 * shows its eight 16-bit groups, and the group the boundary falls inside is filled
 * proportionally rather than rounded to whole cells.
 */
export function BitRuler({ ruler, family }: BitRulerProps) {
  const groupEvery = family === 4 ? 8 : 1;

  return (
    <section class="nc-ruler" aria-label={ruler.title}>
      <div class="nc-ruler__head">
        <span class="nc-label">{ruler.title}</span>
        <span class="nc-ruler__hint">{strings.calc.binaryHint}</span>
      </div>
      <ol class="nc-ruler__cells" data-family={family}>
        {ruler.cells.map((cell, index) => {
          const fraction = cell.networkBits / cell.totalBits;
          const partial = fraction > 0 && fraction < 1;
          return (
            <li
              key={index}
              class={[
                'nc-ruler__cell',
                cell.network ? 'is-network' : '',
                partial ? 'is-partial' : '',
                index === ruler.boundaryAfter ? 'is-boundary' : '',
                index > 0 && index % groupEvery === 0 ? 'is-group-start' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={partial ? `--fill:${(fraction * 100).toFixed(2)}%` : undefined}
            >
              <span class="nc-mono">{cell.text}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
