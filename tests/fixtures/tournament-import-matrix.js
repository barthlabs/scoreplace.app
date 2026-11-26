'use strict';
function matrixFixture(){
 const categories=['Fem A','Fem B','Fem C','Masc A','Masc B','Masc C','Masc PROFESSORES'].map((label,i)=>({id:'division-'+i,label,capacity:i<3?16:8,activeCount:0}));
 const matrix=Array.from({length:54},()=>Array(10).fill(''));
 matrix[0][2]='FEMININA';matrix[0][8]='MASCULINA';
 categories.forEach((cat,i)=>{
  const start=i<3?[2,20,38][i]:[2,12,22,32][i-3],n=i<3?16:8,col=i<3?0:6;
  for(let j=0;j<n;j++){
   const empty=i===0&&j>=14||i===4&&j===0,row=matrix[start+j];
   row[col]=String(j+1);
   if(!empty){row[col+1]='Evento exemplo';row[col+2]=i===6?'PROFESSORES':cat.label.replace('Fem ','Feminina ').replace('Masc ','Masculina ');row[col+3]='Pessoa '+i+' '+String(j+1).padStart(2,'0');}
  }
 });
 return {categories,matrix};
}
module.exports={matrixFixture};
