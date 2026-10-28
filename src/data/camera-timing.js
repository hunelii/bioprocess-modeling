// Scene 01 cinematic retiming. The original 1001 path points are IMMUTABLE;
// only their scroll-time distribution changes for 0 <= progress <= 0.11.
// Piecewise cubic Hermite keeps first derivative continuous at each knot,
// and matches unit velocity at p=.11, avoiding a jerk at Scene 02 boundary.
// A viewer sees the spore during its reveal, then traverses the SAME route to Petri.
export const SCENE01_END = 0.11;
export const CAMERA_TIME_KNOTS = [
  {t:0,    s:0,    d:.08},
  {t:.30,  s:.024,d:.10},
  {t:.48,  s:.056,d:.23},
  {t:.67,  s:.19, d:1.40},
  {t:.86,  s:.70, d:3.00},
  {t:1,    s:1,   d:1.00},
];
export function scene01CameraProgress(p){
  p=Math.max(0, Math.min(1,p));
  if(p>=SCENE01_END) return p;
  const t=p/SCENE01_END;
  let i=0;
  while(i<CAMERA_TIME_KNOTS.length-2 && CAMERA_TIME_KNOTS[i+1].t<t)i++;
  const a=CAMERA_TIME_KNOTS[i],b=CAMERA_TIME_KNOTS[i+1];
  const h=b.t-a.t,u=(t-a.t)/h,u2=u*u,u3=u2*u;
  const s=(2*u3-3*u2+1)*a.s + (u3-2*u2+u)*h*a.d + (-2*u3+3*u2)*b.s +(u3-u2)*h*b.d;
  return SCENE01_END*s;
}

