'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BadgeRussianRuble,
  BarChart3,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  ExternalLink,
  Eye,
  Megaphone,
  MousePointer2,
  PackageCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { HomeActions } from '@/components/home-actions';
import {
  EXTENSION_MARKETPLACE_URL,
  EXTENSION_OPEN_VSX_URL,
  EXTENSION_VERSION,
} from '@/lib/extension-release';
import styles from './home-experience.module.css';

const SignalScene = dynamic(() => import('./signal-scene'), { ssr: false });

type AdFormat = 'standard' | 'premium';

const metrics = [
  { icon: BadgeRussianRuble, value: '50%', detail: 'стоимости показа разработчику' },
  { icon: Bot, value: '2 инструмента', detail: 'Codex и Claude Code' },
  { icon: Eye, value: '5 секунд', detail: 'видимости до зачёта' },
  { icon: ShieldCheck, value: '0 файлов', detail: 'из вашего проекта' },
];

const workflow = [
  {
    number: '01',
    title: 'Установите расширение',
    text: 'Kodpauza доступна в Microsoft Marketplace и Open VSX. Установка занимает несколько минут.',
  },
  {
    number: '02',
    title: 'Работайте с AI как обычно',
    text: 'Отправляйте задачи в Codex или Claude Code. Kodpauza не читает проекты, промпты и ответы.',
  },
  {
    number: '03',
    title: 'Получайте начисления',
    text: 'Короткое объявление появляется только во время ожидания. История показов и доход видны в кабинете.',
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
        <strong>Kodpauza</strong>
        <span>Зарабатывайте, пока AI работает</span>
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
            <span /> Расширение для VS Code
          </p>
          <h1 id="hero-title" data-hero-reveal>
            Получайте доход, пока Codex и Claude Code готовят ответ
          </h1>
          <p className={styles.heroLead} data-hero-reveal>
            Kodpauza показывает короткое объявление во время ожидания AI. 50% стоимости
            подтверждённого показа поступает разработчику.
          </p>
          <div className={styles.heroActions} data-hero-reveal>
            <HomeActions tone="dark" />
          </div>
          <div className={styles.trustRow} data-hero-reveal>
            <span>
              <CheckCircle2 aria-hidden /> Бесплатная установка
            </span>
            <span>
              <CheckCircle2 aria-hidden /> Без доступа к проектам
            </span>
            <span>
              <CheckCircle2 aria-hidden /> Выплаты от 300 ₽
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

      <section className={styles.availability} aria-label="Где доступна Kodpauza" data-reveal>
        <div className={styles.availabilityIntro}>
          <span className={styles.availabilityIcon}>
            <PackageCheck aria-hidden />
          </span>
          <div>
            <strong>Версия {EXTENSION_VERSION} уже доступна</strong>
            <small>Устанавливайте из привычного каталога расширений</small>
          </div>
        </div>
        <div className={styles.storeLinks}>
          <a href={EXTENSION_MARKETPLACE_URL} target="_blank" rel="noreferrer">
            <span>
              <strong>Microsoft Marketplace</strong>
              <small>для Visual Studio Code</small>
            </span>
            <ExternalLink aria-hidden />
          </a>
          <a href={EXTENSION_OPEN_VSX_URL} target="_blank" rel="noreferrer">
            <span>
              <strong>Open VSX Registry</strong>
              <small>открытый каталог расширений</small>
            </span>
            <ExternalLink aria-hidden />
          </a>
        </div>
      </section>

      <section className={styles.intro} data-reveal>
        <p className={styles.sectionLabel}>Как выглядит показ</p>
        <h2>Объявление появляется там, где вы уже ждёте ответ</h2>
        <p>
          Никаких всплывающих окон и отдельных экранов. Одна короткая строка внутри статуса AI
          исчезает, когда задача завершена.
        </p>
      </section>

      <section className={styles.formatsSection} aria-labelledby="formats-title">
        <div className={styles.storyHeading} data-reveal>
          <p className={styles.sectionLabel}>Форматы размещения</p>
          <h2 id="formats-title">Спокойный формат без баннерной слепоты</h2>
          <p>
            Макет ниже повторяет реальное расположение объявления в рабочем интерфейсе. Текст не
            перекрывает запрос, ответ или элементы управления.
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
          <h2 id="workflow-title">Три шага до первого начисления</h2>
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
          <h2>Попробуйте Kodpauza в следующей AI-сессии</h2>
          <p>
            Установите расширение, войдите в аккаунт и продолжайте пользоваться Codex или Claude
            Code как обычно.
          </p>
        </div>
        <div className={styles.finalActions}>
          <Link href="/install" className={styles.primaryCta}>
            Установить бесплатно <ArrowRight aria-hidden />
          </Link>
          <Link href="/for-advertisers" className={styles.secondaryCta}>
            Разместить рекламу
          </Link>
        </div>
        <MousePointer2 aria-hidden className={styles.ctaPointer} />
        <BarChart3 aria-hidden className={styles.ctaChart} />
      </section>
    </div>
  );
}
