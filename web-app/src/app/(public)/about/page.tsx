import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Wrench, Target, Users, TrendingUp, CheckCircle, ArrowRight,
  Zap, Building2, Smartphone, BarChart2,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'เกี่ยวกับ FixITPro — ระบบจัดการร้านมือถือ',
  description: 'FixITPro คืออะไร เหมาะกับใคร และทำไมร้านมือถือถึงควรใช้',
}

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-20 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-purple-600/15 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 mb-6">
              <Zap className="h-3.5 w-3.5 text-blue-400" />
              <span className="text-sm text-blue-300 font-medium">เกี่ยวกับ FixITPro</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-white mb-6 leading-tight">
              ระบบที่เข้าใจ<br />
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                ธุรกิจร้านมือถือ
              </span>
            </h1>
            <p className="text-xl text-slate-400 leading-relaxed">
              FixITPro เกิดจากความต้องการจริงของเจ้าของร้านมือถือ
              ที่ต้องการระบบที่ใช้ง่าย ครอบคลุม และไม่แพง
            </p>
          </div>
        </div>
      </section>

      {/* What is FixITPro */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">FixITPro คืออะไร?</h2>
              <div className="space-y-4 text-slate-600 leading-relaxed">
                <p>
                  <strong className="text-slate-900">FixITPro</strong> คือระบบ SaaS (Software as a Service)
                  สำหรับจัดการร้านมือถือและศูนย์ซ่อมสมาร์ทโฟน ออกแบบมาเพื่อตอบโจทย์ธุรกิจร้านมือถือไทยโดยเฉพาะ
                </p>
                <p>
                  ไม่ใช่ซอฟต์แวร์ ERP ทั่วไปที่ดัดแปลงมาใช้กับร้านมือถือ แต่คือระบบที่ออกแบบขึ้นจาก
                  <strong className="text-slate-900"> workflow จริง</strong> ของร้านซ่อมและขายมือถือ
                </p>
                <p>
                  รวม POS ขายสินค้า, ระบบรับงานซ่อม, สต็อก, ลูกค้า, รายงาน และหลายสาขา
                  ไว้ในแพลตฟอร์มเดียว ใช้ผ่านเว็บหรือแอปพลิเคชัน Android
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { icon: Wrench,     label: 'งานซ่อม',    color: 'bg-orange-50 text-orange-600' },
                { icon: Smartphone, label: 'POS ขายสินค้า', color: 'bg-blue-50 text-blue-600' },
                { icon: BarChart2,  label: 'รายงาน',     color: 'bg-teal-50 text-teal-600' },
                { icon: Building2,  label: 'หลายสาขา',   color: 'bg-purple-50 text-purple-600' },
              ].map(item => (
                <div key={item.label} className={`rounded-2xl ${item.color.split(' ')[0]} p-6 text-center`}>
                  <item.icon className={`h-8 w-8 ${item.color.split(' ')[1]} mx-auto mb-3`} />
                  <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Who is it for */}
      <section className="py-20 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">เหมาะกับใคร?</h2>
            <p className="text-slate-500 text-lg max-w-xl mx-auto">FixITPro เหมาะสำหรับธุรกิจร้านมือถือทุกขนาด</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Wrench,
                title: 'ร้านซ่อมมือถือ',
                desc: 'รับงานซ่อม ติดตามสถานะ ใบเสนอราคา รับประกันงานซ่อม แจ้งเตือนลูกค้าอัตโนมัติ',
                items: ['ร้านซ่อมขนาดเล็ก 1 ช่าง', 'ศูนย์บริการ 3-10 ช่าง', 'Franchise ซ่อมมือถือ'],
              },
              {
                icon: Smartphone,
                title: 'ร้านขายมือถือ',
                desc: 'POS ขายสินค้า สต็อกมือถือและอุปกรณ์ Serial Number รับประกันสินค้า',
                items: ['ร้านมือถือมือสอง', 'ร้านอุปกรณ์เสริม', 'ตัวแทนจำหน่ายมือถือ'],
              },
              {
                icon: Building2,
                title: 'ธุรกิจหลายสาขา',
                desc: 'จัดการทุกสาขาจากที่เดียว เปรียบเทียบผลงาน โอนสต็อกระหว่างสาขา',
                items: ['เชนร้านมือถือ 2-10 สาขา', 'Franchise ระดับภูมิภาค', 'ร้านมือถือในห้างสรรพสินค้า'],
              },
            ].map(g => (
              <div key={g.title} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 mb-4">
                  <g.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{g.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed mb-4">{g.desc}</p>
                <ul className="space-y-2">
                  {g.items.map(i => (
                    <li key={i} className="flex items-center gap-2 text-sm text-slate-600">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />{i}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why phone repair shops should use it */}
      <section className="py-20 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              ทำไมร้านมือถือต้องใช้ FixITPro?
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">
              เพราะร้านมือถือมีความซับซ้อนที่ระบบทั่วไปรองรับไม่ได้
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Target,
                title: 'เฉพาะทางสำหรับมือถือ',
                desc: 'ระบบออกแบบมาสำหรับ workflow ร้านมือถือโดยเฉพาะ ไม่ใช่ระบบทั่วไปที่ดัดแปลงมา ลดขั้นตอนที่ไม่จำเป็น',
              },
              {
                icon: Wrench,
                title: 'ติดตามงานซ่อมได้ทุกขั้นตอน',
                desc: 'ตั้งแต่รับเครื่อง → วินิจฉัย → เสนอราคา → ซ่อม → ส่งมอบ ทุกขั้นตอนมีบันทึกและแจ้งเตือน',
              },
              {
                icon: TrendingUp,
                title: 'ดูข้อมูลธุรกิจได้ทันที',
                desc: 'รู้ยอดขาย กำไร งานซ่อมค้าง สินค้าหมด ทุกอย่างในหน้าจอเดียว ไม่ต้องรวบรวมข้อมูลเอง',
              },
              {
                icon: Users,
                title: 'จัดการทีมได้ง่าย',
                desc: 'กำหนดสิทธิ์พนักงานรายคน ติดตามประสิทธิภาพช่าง ป้องกันการทุจริต',
              },
              {
                icon: Smartphone,
                title: 'รองรับ SUNMI POS',
                desc: 'ทำงานได้บน SUNMI T2, T1 mini ที่ร้านมือถือส่วนใหญ่ใช้ ไม่ต้องซื้อ Hardware ใหม่',
              },
              {
                icon: Building2,
                title: 'ขยายสาขาได้ง่าย',
                desc: 'เปิดสาขาใหม่ใน 5 นาที จัดการทุกสาขาจากหน้าจอเดียว ไม่ต้องมีระบบแยกต่างหาก',
              },
            ].map(r => (
              <div key={r.title} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 mb-4">
                  <r.icon className="h-5 w-5 text-blue-400" />
                </div>
                <h3 className="text-white font-semibold mb-2">{r.title}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg mb-6">
            <Target className="h-7 w-7 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-4">พันธกิจของเรา</h2>
          <p className="text-lg text-slate-600 leading-relaxed mb-4">
            เราเชื่อว่าเจ้าของร้านมือถือทุกคนควรมีเครื่องมือจัดการธุรกิจที่ดีเท่ากับบริษัทใหญ่
            โดยไม่ต้องจ่ายราคาแพง
          </p>
          <p className="text-slate-500 leading-relaxed">
            FixITPro คือคำตอบ — ระบบที่ง่าย ทรงพลัง และราคาที่ร้านมือถือทุกขนาดเข้าถึงได้
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">เริ่มต้นวันนี้ ฟรี 30 วัน</h2>
          <p className="text-blue-100 mb-8">สมัครใช้งานได้เลย ไม่ต้องนัดหมาย ไม่ต้องรอ</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-700 font-bold text-lg hover:bg-blue-50 transition-colors">
              ทดลองใช้ฟรี <ArrowRight className="h-5 w-5" />
            </Link>
            <Link href="/contact" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/30 text-white font-semibold text-lg hover:bg-white/10 transition-colors">
              ติดต่อสอบถาม
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
