import useMeta from './useMeta'
import Hero from '../components/Hero'
import Audience from '../components/Audience'
import Problem from '../components/Problem'
import Steps from '../components/Steps'
import Features from '../components/Features'
import Trust from '../components/Trust'
import CtaBand from '../components/CtaBand'
import Roadmap from '../components/Roadmap'
import { home } from '../content/home'

export default function Home() {
  useMeta(home.meta)

  const { sections, finalCta } = home
  return (
    <main>
      <Hero content={home.hero} />
      <Audience content={sections.audience} />
      <Problem content={sections.problem} />
      <Steps content={sections.steps} />
      <Features content={sections.features} />
      <Trust content={sections.trust} />
      <Roadmap content={sections.roadmap} />
      <CtaBand title={finalCta.title} body={finalCta.body} cta={finalCta.cta} note={finalCta.note} />
    </main>
  )
}
