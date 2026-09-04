'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CodePlayground } from './code-playground';
import { LogoMark } from './logo';

type Group = 'local' | 'sandbox';
type Starter = { id: string; label: string; lang: string; group: Group; code: string };

const STARTERS: Starter[] = [
  {
    id: 'py-hello',
    label: 'Python',
    lang: 'python',
    group: 'local',
    code: `# Python runs right here in your browser (via Pyodide).
name = "world"
for i in range(3):
    print(f"Hello, {name}! (line {i})")
`,
  },
  {
    id: 'py-fizzbuzz',
    label: 'Python · FizzBuzz',
    lang: 'python',
    group: 'local',
    code: `for n in range(1, 16):
    if n % 15 == 0:
        print("FizzBuzz")
    elif n % 3 == 0:
        print("Fizz")
    elif n % 5 == 0:
        print("Buzz")
    else:
        print(n)
`,
  },
  {
    id: 'js-sum',
    label: 'JavaScript',
    lang: 'javascript',
    group: 'local',
    code: `// JavaScript runs in a sandboxed Web Worker.
const nums = [1, 2, 3, 4, 5];
console.log("numbers:", nums);
console.log("sum =", nums.reduce((a, b) => a + b, 0));
`,
  },
  {
    id: 'ts-hello',
    label: 'TypeScript',
    lang: 'typescript',
    group: 'sandbox',
    code: `function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
console.log(greet("TypeScript"));
`,
  },
  {
    id: 'c-hello',
    label: 'C',
    lang: 'c',
    group: 'sandbox',
    code: `#include <stdio.h>

int main(void) {
    for (int i = 1; i <= 5; i++) {
        printf("count %d\\n", i);
    }
    return 0;
}
`,
  },
  {
    id: 'cpp-hello',
    label: 'C++',
    lang: 'cpp',
    group: 'sandbox',
    code: `#include <iostream>

int main() {
    int sum = 0;
    for (int i = 1; i <= 5; i++) sum += i;
    std::cout << "sum = " << sum << std::endl;
}
`,
  },
  {
    id: 'java-hello',
    label: 'Java',
    lang: 'java',
    group: 'sandbox',
    code: `public class Main {
    public static void main(String[] args) {
        for (int i = 1; i <= 3; i++) {
            System.out.println("Hello " + i);
        }
    }
}
`,
  },
  {
    id: 'go-hello',
    label: 'Go',
    lang: 'go',
    group: 'sandbox',
    code: `package main

import "fmt"

func main() {
    for i := 1; i <= 3; i++ {
        fmt.Println("Go", i)
    }
}
`,
  },
  {
    id: 'rust-hello',
    label: 'Rust',
    lang: 'rust',
    group: 'sandbox',
    code: `fn main() {
    let total: i32 = (1..=5).sum();
    println!("sum = {}", total);
}
`,
  },
  {
    id: 'ruby-hello',
    label: 'Ruby',
    lang: 'ruby',
    group: 'sandbox',
    code: `3.times { |i| puts "Hello #{i}" }
`,
  },
  {
    id: 'php-hello',
    label: 'PHP',
    lang: 'php',
    group: 'sandbox',
    code: `<?php
for ($i = 1; $i <= 3; $i++) {
    echo "Hello $i\\n";
}
`,
  },
  {
    id: 'cs-hello',
    label: 'C#',
    lang: 'csharp',
    group: 'sandbox',
    code: `class Program {
    static void Main() {
        for (int i = 1; i <= 3; i++) {
            System.Console.WriteLine("Hello " + i);
        }
    }
}
`,
  },
];

export function PlaygroundView() {
  const [active, setActive] = useState<Starter>(STARTERS[0]);
  const local = STARTERS.filter((s) => s.group === 'local');
  const sandbox = STARTERS.filter((s) => s.group === 'sandbox');

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Link href="/" className="ring-focus flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="text-[19px] font-semibold tracking-tight text-ink">MeritFlow</span>
          </Link>
          <span className="hidden text-sm text-faint sm:inline">/ Playground</span>
          <Link
            href="/"
            className="press ring-focus ml-auto rounded-full border border-line px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:border-accent/40"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <span className="eyebrow">Practice IDE</span>
        <h1 className="display mt-4 text-[clamp(2.2rem,5vw,3.4rem)] text-ink">
          Code{' '}
          <span className="marker">
            <span>playground</span>
          </span>
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-[17px] leading-relaxed text-muted">
          Write and run code in 11 languages, no setup, no install. Python and JavaScript run instantly in your
          browser; the rest run in a free, sandboxed cloud runtime.
        </p>

        <div className="mt-6 space-y-3">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Runs in your browser</p>
            <div className="flex flex-wrap gap-2">
              {local.map((s) => (
                <Chip key={s.id} starter={s} active={active.id === s.id} onClick={() => setActive(s)} />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
              Runs in a free cloud sandbox
            </p>
            <div className="flex flex-wrap gap-2">
              {sandbox.map((s) => (
                <Chip key={s.id} starter={s} active={active.id === s.id} onClick={() => setActive(s)} />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <CodePlayground key={active.id} initialCode={active.code} language={active.lang} heightClass="h-[24rem]" />
        </div>

        <p className="mt-3 text-xs text-faint">
          Python uses Pyodide (CPython in WebAssembly); the first run downloads it once. JavaScript runs in an isolated
          worker. Other languages compile and run on the Wandbox sandbox (free, no key), sign in to use them.
        </p>
      </main>
    </div>
  );
}

function Chip({ starter, active, onClick }: { starter: Starter; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={[
        'press ring-focus rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors',
        active
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-line bg-surface text-muted hover:border-accent/40 hover:text-ink',
      ].join(' ')}
    >
      {starter.label}
    </button>
  );
}
