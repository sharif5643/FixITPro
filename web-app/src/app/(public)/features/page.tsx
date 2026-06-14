import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ShoppingCart, Wrench, Package, Users, BarChart2, Building2,
  Bell, ArrowRight, CheckCircle, Zap, CreditCard, FileText,
  Barcode, Clock, Shield, Smartphone, ArrowRightLeft,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'ฟีเจอร์ทั้งหมด — FixITPro',
  description: 'ระบบจัดการร้านมือถือครบวงจร POS ขาย ซ่อม สต็อก ลูกค้า รายงาน หลายสาขา',
}

type Feature = {
  icon: React.ElementType
  title: string
  desc: string
  items: string[]
  color: string
  bg: string
}

const features: Feature[] = [
  {
    icon: ShoppingCart,
    title: 'POS ขายสินค้า',
    desc: 'ระบบขายหน้าร้านที่ออกแบบมาเพื่อร้านมือถือโดยเฉพาะ ใช้งานง่าย รวดเร็ว',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    items: [
      'สแกนบาร์โค้ดสินค้าด้วยกล้องหรือเครื่องสแกน',
      'ส่วนลดรายสินค้าและส่วนลดรวมบิล',
      'รับชำระเงินสด โอน บัตร QR Code',
      'พิมพ์ใบเสร็จและส่ง SMS/LINE',
      'บันทึกการขายแบบ Offline ได้',
      'เปิด/ปิดกะ นับเงินปลายกะ',
    ],
  },
  {
    icon: Wrench,
    title: 'จัดการงานซ่อม',
    desc: 'ติดตามสถานะการซ่อมครบทุกขั้นตอน ตั้งแต่รับเครื่องจนส่งมอบ',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    items: [
      'รับงานซ่อมพร้อมถ่ายรูปสภาพเครื่อง',
      'ติดตามสถานะ: รออนุมัติ → กำลังซ่อม → เสร็จแล้ว',
      'แจ้งเตือนลูกค้าอัตโนมัติเมื่อซ่อมเสร็จ',
      'ใบเสนอราคา + ลายเซ็นลูกค้า',
      'ประวัติการซ่อมรายเครื่อง IMEI',
      'การรับประกันงานซ่อม',
    ],
  },
  {
    icon: Package,
    title: 'ควบคุมสต็อกสินค้า',
    desc: 'บริหารสินค้าคงคลังอย่างมืออาชีพ ไม่ต้องเปิดไฟล์ Excel อีกต่อไป',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    items: [
      'นำเข้า-ส่งออกสินค้าด้วย CSV',
      'แจ้งเตือนสินค้าใกล้หมด กำหนด Minimum Stock',
      'ประวัติการเคลื่อนไหวสต็อกรายวัน',
      'พิมพ์บาร์โค้ดสติกเกอร์สินค้า',
      'จัดหมวดหมู่สินค้า Brand/รุ่น',
      'ระบบ Serial Number สำหรับสินค้ามีมูลค่าสูง',
    ],
  },
  {
    icon: Users,
    title: 'ฐานข้อมูลลูกค้า',
    desc: 'รวมข้อมูลลูกค้าไว้ในที่เดียว เข้าถึงประวัติได้ทันที',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    items: [
      'บันทึกข้อมูลลูกค้าพร้อมเบอร์โทร',
      'ประวัติการซื้อและซ่อมทุกรายการ',
      'ยอดค้างชำระ ติดตามหนี้',
      'Export รายชื่อลูกค้า CSV',
      'ค้นหาลูกค้าด้วยชื่อหรือเบอร์',
      'บันทึก IMEI เครื่องที่ลูกค้านำมาซ่อม',
    ],
  },
  {
    icon: BarChart2,
    title: 'รายงานและวิเคราะห์',
    desc: 'ข้อมูลเชิงลึกที่ช่วยให้คุณตัดสินใจทางธุรกิจได้อย่างถูกต้อง',
    color: 'text-teal-600',
    bg: 'bg-teal-50',
    items: [
      'รายงานยอดขายรายวัน สัปดาห์ เดือน',
      'กำไร-ขาดทุน ต้นทุนสินค้า',
      'สินค้าขายดี 10 อันดับ',
      'ประสิทธิภาพช่างซ่อมรายคน',
      'รายงาน PDF พร้อมส่ง',
      'ปิดบัญชีประจำวัน',
    ],
  },
  {
    icon: Building2,
    title: 'รองรับหลายสาขา',
    desc: 'จัดการธุรกิจหลายสาขาจากหน้าจอเดียว ไม่ต้องสลับระบบ',
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    items: [
      'แดชบอร์ดรวมทุกสาขาในที่เดียว',
      'เปรียบเทียบประสิทธิภาพสาขา',
      'โอนสต็อกระหว่างสาขา',
      'กำหนดสิทธิ์พนักงานรายสาขา',
      'รายงานแยกสาขาหรือรวม',
    ],
  },
  {
    icon: Bell,
    title: 'แจ้งเตือนอัตโนมัติ',
    desc: 'ไม่พลาดทุกเหตุการณ์สำคัญในร้าน',
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    items: [
      'งานซ่อมเกินกำหนดหรือค้างนาน',
      'สินค้าใกล้หมด ต่ำกว่า Min Stock',
      'ลูกค้ารอรับเครื่องนานเกิน',
      'การรับประกันใกล้หมดอายุ',
      'แจ้งเตือนผ่านระบบ + LINE (เร็วๆ นี้)',
    ],
  },
  {
    icon: Smartphone,
    title: 'รองรับ SUNMI POS',
    desc: 'ทำงานได้อย่างราบรื่นบนอุปกรณ์ SUNMI T2, T1 mini',
    color: 'text-cyan-600',
    bg: 'bg-cyan-50',
    items: [
      'APK สำหรับ SUNMI โดยเฉพาะ',
      'พิมพ์ใบเสร็จผ่านเครื่องพิมพ์ SUNMI',
      'หน้าจอ POS ออกแบบสำหรับ Touch',
      'Dashboard สรุปยอดขาย SUNMI',
      'รายงานปิดกะ SUNMI',
    ],
  },
]

function FeatureCard({ feature }: { feature: Feature }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-8 shadow-sm hover:shadow-md transition-shadow">
      <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${feature.bg} mb-5`}>
        <feature.icon className={`h-7 w-7 ${feature.color}`} />
      </div>
      <h3 className="text-xl font-bold text-slate-900 mb-2">{feature.title}</h3>
      <p className="text-slate-500 mb-5 leading-relaxed">{feature.desc}</p>
      <ul className="space-y-2.5">
        {feature.items.map(item => (
          <li key={item} className="flex items-start gap-2.5 text-sm text-slate-600">
            <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-16 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 mb-6">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">ฟีเจอร์ครบครัน</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            ทุกสิ่งที่ร้านมือถือต้องการ
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl mx-auto">
            ไม่ใช่ ERP ทั่วไป แต่คือระบบที่ออกแบบมาสำหรับร้านมือถือและงานซ่อมโดยเฉพาะ
          </p>
        </div>
      </section>

      {/* Features grid */}
      <section className="py-16 lg:py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map(f => (
              <FeatureCard key={f.title} feature={f} />
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons coming soon */}
      <section className="py-14 bg-white border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-2">Add-on เพิ่มเติม (เร็วๆ นี้)</h2>
          <p className="text-slate-500 text-center mb-10">ฟีเจอร์เสริมสำหรับธุรกิจที่ต้องการมากกว่า</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users,       label: 'HR & พนักงาน',    desc: 'จัดการเวลางาน ลางาน เงินเดือน' },
              { icon: FileText,    label: 'บัญชีและภาษี',    desc: 'บันทึกรายรับรายจ่าย ภาษีมูลค่าเพิ่ม' },
              { icon: CreditCard,  label: 'LINE Notify',     desc: 'แจ้งเตือนลูกค้าผ่าน LINE OA' },
              { icon: ArrowRightLeft, label: 'Telegram Bot', desc: 'รับแจ้งเตือนผ่าน Telegram ทันที' },
            ].map(a => (
              <div key={a.label} className="rounded-xl border border-dashed border-slate-200 p-5 text-center opacity-70">
                <a.icon className="h-8 w-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">{a.label}</p>
                <p className="text-xs text-slate-400">{a.desc}</p>
                <span className="inline-block mt-3 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">พร้อมเริ่มใช้งาน?</h2>
          <p className="text-blue-100 text-lg mb-8">ทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-700 font-bold text-lg hover:bg-blue-50 transition-colors shadow-lg"
          >
            ทดลองใช้ฟรี 30 วัน <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  )
}
