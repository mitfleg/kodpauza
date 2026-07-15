'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeRussianRuble,
  BarChart3,
  Check,
  CheckCircle2,
  Code2,
  Eye,
  Megaphone,
  MousePointer2,
  ShieldCheck,
  Sparkles,
  TimerReset,
} from 'lucide-react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HomeActions } from '@/components/home-actions';
import styles from './home-experience.module.css';

const SignalScene = dynamic(() => import('./signal-scene'), { ssr: false });

type AdFormat = 'standard' | 'premium';

const metrics = [
  { icon: Eye, value: '5 секунд', detail: 'до засчитанного показа' },
  { icon: BadgeRussianRuble, value: '50%', detail: 'доля разработчика' },
  { icon: ShieldCheck, value: 'Без доступа', detail: 'к коду и запросам' },
  { icon: TimerReset, value: 'Автоповтор', detail: 'при временном сбое' },
];

const workflow = [
  {
    number: '01',
    title: 'Рекламодатель создаёт кампанию',
    text: 'Задаёт текст, ссылку, формат, CPM, бюджет и при необходимости лимит показов.',
  },
  {
    number: '02',
    title: 'Объявление проходит модерацию',
    text: 'Администратор проверяет содержание и запускает кампанию в подключённых интеграциях.',
  },
  {
    number: '03',
    title: 'Результат появляется в кабинетах',
    text: 'Рекламодатель видит расход и эффективность, разработчик — показы и начисленный доход.',
  },
];

function CodexAdPreview({ format, compact = false }: { format: AdFormat; compact?: boolean }) {
  const premium = format === 'premium';
  return (
    <div className={`${styles.codexPreview} ${compact ? styles.codexPreviewCompact : ''}`}>
      <div className={styles.codexTabs}>
        <span>New Agent</span>
        <strong>Codex</strong>
        <span>Claude Code</span>
        <i>＋</i>
        <i>•••</i>
      </div>
      <div className={styles.codexThreadHead}>
        <span>←</span>
        <strong>Объяснить код</strong>
        <span>••• · ◌ · ⚙</span>
      </div>
      <div className={styles.codexPrompt}>
        <span>Что делает этот код?</span>
        <small>13:06</small>
      </div>
      <div className={`${styles.codexAd} ${premium ? styles.codexAdPremium : ''}`}>
        <strong>Реклама</strong>
        <span>Платформа для заработка на рекламе</span>
      </div>
      <div className={styles.codexSpace} />
      <div className={styles.codexComposer}>
        <span>Ask for follow-up changes</span>
        <div>
          <strong>＋</strong>
          <small>Approve for me</small>
          <i>5.6 · Extra High · ■</i>
        </div>
      </div>
      <div className={styles.codexLocal}>▱ Work locally ⌄</div>
    </div>
  );
}

export function HomeExperience() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [webGlAvailable, setWebGlAvailable] = useState(false);
  const [previewFormat, setPreviewFormat] = useState<AdFormat>('premium');

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      setWebGlAvailable(Boolean(context));
    } catch {
      setWebGlAvailable(false);
    }
  }, []);

  useGSAP(
    () => {
      gsap.registerPlugin(useGSAP, ScrollTrigger);
      const media = gsap.matchMedia();
      media.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.from('[data-hero-reveal]', {
          autoAlpha: 0,
          y: 20,
          duration: 0.65,
          ease: 'power3.out',
          stagger: 0.07,
        });
        gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((element) => {
          gsap.from(element, {
            scrollTrigger: { trigger: element, start: 'top 88%', once: true },
            autoAlpha: 0,
            y: 22,
            duration: 0.6,
            ease: 'power3.out',
          });
        });
      });
      return () => media.revert();
    },
    { scope: rootRef },
  );

  return (
    <div ref={rootRef} className={styles.page}>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroGlow} aria-hidden>
          {webGlAvailable ? (
            <SignalScene reducedMotion={reducedMotion} />
          ) : (
            <span className={styles.heroGlowFallback} />
          )}
        </div>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow} data-hero-reveal>
            <span /> Реклама внутри инструментов разработчика
          </p>
          <h1 id="hero-title" data-hero-reveal>
            Монетизация пауз Codex и Claude Code без помех работе
          </h1>
          <p className={styles.heroLead} data-hero-reveal>
            Kodpauza показывает одну нативную строку, пока Codex или Claude Code готовит ответ.
            Разработчик получает 50% стоимости каждого засчитанного показа.
          </p>
          <div className={styles.heroActions} data-hero-reveal>
            <HomeActions tone="dark" />
          </div>
          <div className={styles.trustRow} data-hero-reveal>
            <span>
              <CheckCircle2 aria-hidden /> Без доступа к коду
            </span>
            <span>
              <CheckCircle2 aria-hidden /> Два формата размещения
            </span>
            <span>
              <CheckCircle2 aria-hidden /> Прозрачные начисления
            </span>
          </div>
        </div>

        <div className={styles.heroVisual} data-hero-reveal>
          <div className={styles.livePreview}>
            <div className={styles.previewSwitcher} aria-label="Формат объявления">
              <button
                type="button"
                aria-pressed={previewFormat === 'standard'}
                onClick={() => setPreviewFormat('standard')}
                className={previewFormat === 'standard' ? styles.previewSwitchActive : ''}
              >
                Стандарт
              </button>
              <button
                type="button"
                aria-pressed={previewFormat === 'premium'}
                onClick={() => setPreviewFormat('premium')}
                className={previewFormat === 'premium' ? styles.previewSwitchActive : ''}
              >
                <Sparkles aria-hidden /> Премиум
              </button>
            </div>
            <CodexAdPreview format={previewFormat} />
          </div>
        </div>

        <div className={styles.heroMetrics} data-hero-reveal>
          {metrics.map(({ icon: Icon, value, detail }) => (
            <div key={value}>
              <Icon aria-hidden />
              <span>
                <strong>{value}</strong>
                <small>{detail}</small>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.intro} data-reveal>
        <p className={styles.sectionLabel}>Встроено в рабочий процесс</p>
        <h2>Одна строка в естественной паузе, а не отдельный рекламный экран</h2>
        <p>
          Формат повторяет реальное отображение в Codex: текст появляется внутри диалога и не
          перекрывает код, запрос или элементы управления.
        </p>
      </section>

      <section className={styles.formatsSection} aria-labelledby="formats-title">
        <div className={styles.storyHeading} data-reveal>
          <p className={styles.sectionLabel}>Форматы размещения</p>
          <h2 id="formats-title">Стандартный и премиальный</h2>
          <p>
            Оба варианта показаны интерфейсом, собранным по текущему виду интеграции, без
            использования скриншотов.
          </p>
        </div>
        <div className={styles.formatGrid}>
          <article className={styles.formatCard} data-reveal>
            <div className={styles.formatCardHead}>
              <div>
                <span>Стандарт</span>
                <strong>Спокойная нативная строка</strong>
              </div>
              <small>Базовый CPM</small>
            </div>
            <CodexAdPreview format="standard" compact />
          </article>
          <article className={`${styles.formatCard} ${styles.formatCardPremium}`} data-reveal>
            <div className={styles.formatCardHead}>
              <div>
                <span>
                  <Sparkles aria-hidden /> Премиум
                </span>
                <strong>Акцент тонкой рамкой</strong>
              </div>
              <small>+50% к CPM</small>
            </div>
            <CodexAdPreview format="premium" compact />
          </article>
        </div>
      </section>

      <section className={styles.workflowSection} aria-labelledby="workflow-title">
        <div className={styles.storyHeading} data-reveal>
          <p className={styles.sectionLabel}>Как работает платформа</p>
          <h2 id="workflow-title">От объявления до понятного результата</h2>
        </div>
        <div className={styles.workflowGrid}>
          {workflow.map((item) => (
            <article key={item.number} data-reveal>
              <span>{item.number}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.audiences} aria-label="Возможности платформы">
        <article className={styles.audienceCard} data-reveal>
          <div className={styles.cardTop}>
            <span className={styles.cardIcon}>
              <Code2 aria-hidden />
            </span>
            <span>Для разработчика</span>
          </div>
          <h2>Зарабатывайте, не меняя привычный процесс</h2>
          <p>Установите расширение, включите показы и следите за начислениями в личном кабинете.</p>
          <ul>
            <li>
              <Check aria-hidden /> Установка в VS Code
            </li>
            <li>
              <Check aria-hidden /> История показов и дохода
            </li>
            <li>
              <Check aria-hidden /> 50% от стоимости показов
            </li>
          </ul>
          <Link href="/for-developers">
            Подробнее разработчикам <ArrowRight aria-hidden />
          </Link>
        </article>
        <article className={`${styles.audienceCard} ${styles.audienceCardBlue}`} data-reveal>
          <div className={styles.cardTop}>
            <span className={styles.cardIcon}>
              <Megaphone aria-hidden />
            </span>
            <span>Для рекламодателя</span>
          </div>
          <h2>Будьте заметны в правильный момент</h2>
          <p>
            Запускайте кампании для технической аудитории и контролируйте расход и эффективность.
          </p>
          <ul>
            <li>
              <Check aria-hidden /> Настройка бюджета и CPM
            </li>
            <li>
              <Check aria-hidden /> Модерация объявлений
            </li>
            <li>
              <Check aria-hidden /> Метрики по каждой кампании
            </li>
          </ul>
          <Link href="/for-advertisers">
            Подробнее рекламодателям <ArrowRight aria-hidden />
          </Link>
        </article>
      </section>

      <section className={styles.finalCta} data-reveal>
        <div>
          <p className={styles.sectionLabel}>Начать просто</p>
          <h2>Один аккаунт — и первый шаг уже сделан</h2>
          <p>
            Разработчик подключает расширение, рекламодатель создаёт кампанию и отслеживает
            результат.
          </p>
        </div>
        <div className={styles.finalActions}>
          <Link href="/register" className={styles.primaryCta}>
            Создать аккаунт <ArrowRight aria-hidden />
          </Link>
          <Link href="/docs" className={styles.secondaryCta}>
            Посмотреть документацию
          </Link>
        </div>
        <MousePointer2 aria-hidden className={styles.ctaPointer} />
        <BarChart3 aria-hidden className={styles.ctaChart} />
      </section>
    </div>
  );
}
