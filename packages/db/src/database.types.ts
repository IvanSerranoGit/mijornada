
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "calculo": {
          Tables: {
            "regla": {
                  Row: {
                    "clave": string,"creado_en": string,"fuente": string,"id": string,"unidad": string,"valor": number,"vigente_desde": string,"vigente_hasta": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "clave": string,"creado_en"?: string,"fuente": string,"id"?: string,"unidad": string,"valor": number,"vigente_desde": string,"vigente_hasta"?: string | null
                  }
                  Update: {
                    "clave"?: string,"creado_en"?: string,"fuente"?: string,"id"?: string,"unidad"?: string,"valor"?: number,"vigente_desde"?: string,"vigente_hasta"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"resumen_periodo": {
                  Row: {
                    "alertas": NonNullable<Json>,"extra_dobles": number,"extra_triples": number,"horas_ordinarias": number,"periodo_fin": string,"periodo_inicio": string,"recalculado_en": string,"tenant_id": string,"trabajador_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "alertas"?: NonNullable<Json>,"extra_dobles"?: number,"extra_triples"?: number,"horas_ordinarias"?: number,"periodo_fin": string,"periodo_inicio": string,"recalculado_en"?: string,"tenant_id": string,"trabajador_id": string
                  }
                  Update: {
                    "alertas"?: NonNullable<Json>,"extra_dobles"?: number,"extra_triples"?: number,"horas_ordinarias"?: number,"periodo_fin"?: string,"periodo_inicio"?: string,"recalculado_en"?: string,"tenant_id"?: string,"trabajador_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "dias_habiles_entre":
{ Args: { "p_desde": string,"p_hasta": string }; Returns: number
                           },
"regla_vigente":
{ Args: { "p_clave": string,"p_fecha": string }; Returns: number
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"cumplimiento": {
          Tables: {
            "acceso_inspector": {
                  Row: {
                    "creado_en": string,"creado_por": string,"expira_en": string,"id": string,"reporte_id": string,"revocado_en": string | null,"tenant_id": string,"token_hash": string | null,"usuario_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"creado_por": string,"expira_en"?: string,"id"?: string,"reporte_id": string,"revocado_en"?: string | null,"tenant_id": string,"token_hash"?: string | null,"usuario_id": string
                  }
                  Update: {
                    "creado_en"?: string,"creado_por"?: string,"expira_en"?: string,"id"?: string,"reporte_id"?: string,"revocado_en"?: string | null,"tenant_id"?: string,"token_hash"?: string | null,"usuario_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "acceso_inspector_tenant_id_reporte_id_fkey"
      columns: ["tenant_id","reporte_id"]
isOneToOne: false
      referencedRelation: "reporte"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"consentimiento": {
                  Row: {
                    "aceptado_en": string,"archivo_hash": string | null,"archivo_url": string | null,"documento_id": string,"evidencia_hash": string | null,"id": string,"ip": unknown,"metodo": string,"nombre_tecleado": string | null,"registrado_por": string | null,"tenant_id": string,"trabajador_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceptado_en"?: string,"archivo_hash"?: string | null,"archivo_url"?: string | null,"documento_id": string,"evidencia_hash"?: string | null,"id"?: string,"ip"?: unknown,"metodo": string,"nombre_tecleado"?: string | null,"registrado_por"?: string | null,"tenant_id": string,"trabajador_id": string,"user_agent"?: string | null
                  }
                  Update: {
                    "aceptado_en"?: string,"archivo_hash"?: string | null,"archivo_url"?: string | null,"documento_id"?: string,"evidencia_hash"?: string | null,"id"?: string,"ip"?: unknown,"metodo"?: string,"nombre_tecleado"?: string | null,"registrado_por"?: string | null,"tenant_id"?: string,"trabajador_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consentimiento_tenant_id_documento_id_fkey"
      columns: ["tenant_id","documento_id"]
isOneToOne: false
      referencedRelation: "documento"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"documento": {
                  Row: {
                    "contenido_hash": string,"contenido_md": string | null,"creado_en": string,"creado_por": string | null,"id": string,"plantilla_version": string | null,"resumen_md": string | null,"tenant_id": string,"tipo": string,"url_pdf": string | null,"version": number,"vigente_desde": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contenido_hash": string,"contenido_md"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"plantilla_version"?: string | null,"resumen_md"?: string | null,"tenant_id": string,"tipo": string,"url_pdf"?: string | null,"version": number,"vigente_desde": string
                  }
                  Update: {
                    "contenido_hash"?: string,"contenido_md"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"plantilla_version"?: string | null,"resumen_md"?: string | null,"tenant_id"?: string,"tipo"?: string,"url_pdf"?: string | null,"version"?: number,"vigente_desde"?: string
                  }
                  Relationships: [
                    
                  ]
                },"incidencia": {
                  Row: {
                    "aceptada_en": string | null,"aceptada_por": string | null,"comentario_trabajador": string | null,"creado_en": string,"estado": string,"evento_referido_id": string | null,"evento_resultante_id": string | null,"extemporanea": boolean,"fecha": string,"id": string,"inconforme_en": string | null,"motivo": string,"resuelto_en": string | null,"resuelto_por": string | null,"solicitado_por": string,"tenant_id": string,"tipo": string,"tipo_marcaje": string | null,"trabajador_id": string,"ts_declarado": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "aceptada_en"?: string | null,"aceptada_por"?: string | null,"comentario_trabajador"?: string | null,"creado_en"?: string,"estado"?: string,"evento_referido_id"?: string | null,"evento_resultante_id"?: string | null,"extemporanea"?: boolean,"fecha": string,"id"?: string,"inconforme_en"?: string | null,"motivo": string,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"solicitado_por": string,"tenant_id": string,"tipo": string,"tipo_marcaje"?: string | null,"trabajador_id": string,"ts_declarado"?: string | null
                  }
                  Update: {
                    "aceptada_en"?: string | null,"aceptada_por"?: string | null,"comentario_trabajador"?: string | null,"creado_en"?: string,"estado"?: string,"evento_referido_id"?: string | null,"evento_resultante_id"?: string | null,"extemporanea"?: boolean,"fecha"?: string,"id"?: string,"inconforme_en"?: string | null,"motivo"?: string,"resuelto_en"?: string | null,"resuelto_por"?: string | null,"solicitado_por"?: string,"tenant_id"?: string,"tipo"?: string,"tipo_marcaje"?: string | null,"trabajador_id"?: string,"ts_declarado"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"plantilla": {
                  Row: {
                    "contenido_md": string,"creado_en": string,"resumen_md": string | null,"tipo": string,"version": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contenido_md": string,"creado_en"?: string,"resumen_md"?: string | null,"tipo": string,"version": string
                  }
                  Update: {
                    "contenido_md"?: string,"creado_en"?: string,"resumen_md"?: string | null,"tipo"?: string,"version"?: string
                  }
                  Relationships: [
                    
                  ]
                },"reporte": {
                  Row: {
                    "centro_id": string | null,"generado_en": string,"hash_contenido": string,"hash_raiz": string | null,"id": string,"n_eventos": number | null,"rango": unknown,"solicitante": string,"tenant_id": string,"tipo": string,"token_hash": string | null,"trabajador_ids": (string)[] | null,"url_csv": string | null,"url_csv_dias": string | null,"url_pdf": string | null,"cadenas_de_reporte": {
              "evento_roto_id": string,"evento_roto_ts": string,"integra": boolean,"motivo": string,"n_eventos": number,"trabajador_id": string
            } | null
                  }
                  ComputedFields: "cadenas_de_reporte"
                  Insert: {
                    "centro_id"?: string | null,"generado_en"?: string,"hash_contenido": string,"hash_raiz"?: string | null,"id"?: string,"n_eventos"?: number | null,"rango": unknown,"solicitante": string,"tenant_id": string,"tipo": string,"token_hash"?: string | null,"trabajador_ids"?: (string)[] | null,"url_csv"?: string | null,"url_csv_dias"?: string | null,"url_pdf"?: string | null
                  }
                  Update: {
                    "centro_id"?: string | null,"generado_en"?: string,"hash_contenido"?: string,"hash_raiz"?: string | null,"id"?: string,"n_eventos"?: number | null,"rango"?: unknown,"solicitante"?: string,"tenant_id"?: string,"tipo"?: string,"token_hash"?: string | null,"trabajador_ids"?: (string)[] | null,"url_csv"?: string | null,"url_csv_dias"?: string | null,"url_pdf"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "abrir_incidencia":
{ Args: { "p_evento_referido_id"?: string,"p_fecha": string,"p_hora"?: string,"p_motivo": string,"p_tipo": string,"p_tipo_marcaje"?: string,"p_trabajador_id": string }; Returns: {
              "aceptada_en": string | null,
"aceptada_por": string | null,
"comentario_trabajador": string | null,
"creado_en": string,
"estado": string,
"evento_referido_id": string | null,
"evento_resultante_id": string | null,
"extemporanea": boolean,
"fecha": string,
"id": string,
"inconforme_en": string | null,
"motivo": string,
"resuelto_en": string | null,
"resuelto_por": string | null,
"solicitado_por": string,
"tenant_id": string,
"tipo": string,
"tipo_marcaje": string | null,
"trabajador_id": string,
"ts_declarado": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "incidencia"
        isOneToOne: true
        isSetofReturn: false
      } },
"acceso_inspector_por_token":
{ Args: { "p_token": string }; Returns: {
              "correo": string,"expira_en": string,"reporte_id": string
            }[]
                           },
"aceptar_documento":
{ Args: { "p_documento_id": string,"p_ip"?: unknown,"p_nombre": string,"p_user_agent"?: string }; Returns: {
              "aceptado_en": string,"consentimiento_id": string,"evidencia_hash": string
            }[]
                           },
"aceptar_incidencia":
{ Args: { "p_incidencia_id": string }; Returns: string
                           },
"aviso_publico":
{ Args: { "p_centro_id": string }; Returns: {
              "contenido_md": string,"foto_en_kiosco": boolean,"foto_en_telefono": boolean,"metodo_marcaje": string,"razon_social": string,"version": number,"vigente_desde": string
            }[]
                           },
"cadenas_de_reporte":
{ Args: { "p_reporte": Omit<Database["cumplimiento"]['Tables']["reporte"]['Row'], Database["cumplimiento"]['Tables']["reporte"]['ComputedFields']> }; Returns: {
              "evento_roto_id": string,"evento_roto_ts": string,"integra": boolean,"motivo": string,"n_eventos": number,"trabajador_id": string
            }[]
                           },
"calcular_evidencia":
{ Args: { "p_aceptado_en": string,"p_documento_hash": string,"p_ip": unknown,"p_nombre_tecleado": string,"p_trabajador_id": string }; Returns: string
                           },
"consultas_de_inspector":
{ Args: { "p_reporte_id": string }; Returns: {
              "accion": string,"ip": unknown,"ts": string
            }[]
                           },
"crear_acceso_inspector":
{ Args: { "p_auth_user_id": string,"p_reporte_id": string,"p_token_hash": string }; Returns: {
              "creado_en": string,
"creado_por": string,
"expira_en": string,
"id": string,
"reporte_id": string,
"revocado_en": string | null,
"tenant_id": string,
"token_hash": string | null,
"usuario_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "acceso_inspector"
        isOneToOne: true
        isSetofReturn: false
      } },
"documentos_vigentes":
{ Args: { "p_tenant_id": string }; Returns: {
              "contenido_hash": string,
"contenido_md": string | null,
"creado_en": string,
"creado_por": string | null,
"id": string,
"plantilla_version": string | null,
"resumen_md": string | null,
"tenant_id": string,
"tipo": string,
"url_pdf": string | null,
"version": number,
"vigente_desde": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "documento"
        isOneToOne: false
        isSetofReturn: true
      } },
"estado_consentimientos":
{ Args: { "p_tenant_id": string }; Returns: {
              "aceptado": boolean,"aceptado_en": string,"documento_id": string,"metodos": (string)[],"tipo": string,"trabajador_id": string,"version": number
            }[]
                           },
"inspector_puede_ver_reporte":
{ Args: { "p_reporte_id": string,"p_tenant_id": string }; Returns: boolean
                           },
"kiosco_aceptar":
{ Args: { "p_documento_id": string,"p_ip"?: unknown,"p_pin"?: string,"p_qr"?: string,"p_token": string,"p_user_agent"?: string }; Returns: {
              "aceptado_en": string,"consentimiento_id": string,"evidencia_hash": string
            }[]
                           },
"kiosco_aviso_pendiente":
{ Args: { "p_pin"?: string,"p_qr"?: string,"p_token": string }; Returns: {
              "centro_id": string,"documento_id": string,"foto_en_kiosco": boolean,"foto_en_telefono": boolean,"metodo_marcaje": string,"nombre": string,"pendiente": boolean,"resumen_md": string,"version": number
            }[]
                           },
"normalizar_nombre":
{ Args: { "p_nombre": string }; Returns: string
                           },
"registrar_aceptacion":
{ Args: { "p_documento": Omit<Database["cumplimiento"]['Tables']["documento"]['Row'], Database["cumplimiento"]['Tables']["documento"]['ComputedFields']>,"p_ip": unknown,"p_metodo": string,"p_nombre_tecleado": string,"p_registrado_por": string,"p_trabajador_id": string,"p_user_agent": string }; Returns: {
              "aceptado_en": string,
"archivo_hash": string | null,
"archivo_url": string | null,
"documento_id": string,
"evidencia_hash": string | null,
"id": string,
"ip": unknown,
"metodo": string,
"nombre_tecleado": string | null,
"registrado_por": string | null,
"tenant_id": string,
"trabajador_id": string,
"user_agent": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "consentimiento"
        isOneToOne: true
        isSetofReturn: false
      } },
"registrar_consulta_inspector":
{ Args: { "p_accion": string,"p_ip"?: unknown,"p_reporte_id": string }; Returns: undefined
                           },
"registrar_reporte":
{ Args: { "p_centro_id": string,"p_desde": string,"p_hash_contenido": string,"p_hash_raiz": string,"p_hasta": string,"p_id": string,"p_n_eventos": number,"p_tipo": string,"p_token_hash": string,"p_trabajador_ids": (string)[],"p_url_csv": string,"p_url_csv_dias": string,"p_url_pdf": string }; Returns: {
              "centro_id": string | null,
"generado_en": string,
"hash_contenido": string,
"hash_raiz": string | null,
"id": string,
"n_eventos": number | null,
"rango": unknown,
"solicitante": string,
"tenant_id": string,
"tipo": string,
"token_hash": string | null,
"trabajador_ids": (string)[] | null,
"url_csv": string | null,
"url_csv_dias": string | null,
"url_pdf": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "reporte"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolver_incidencia":
{ Args: { "p_aprobar": boolean,"p_incidencia_id": string }; Returns: string
                           },
"responder_incidencia":
{ Args: { "p_comentario"?: string,"p_conforme": boolean,"p_incidencia_id": string }; Returns: string
                           },
"verificacion_publica":
{ Args: { "p_token": string }; Returns: {
              "cadenas": number,"desde": string,"dias_sellados": number,"eventos": number,"eventos_al_generar": number,"generado_en": string,"hash_contenido": string,"hash_raiz": string,"hasta": string,"integra": boolean,"tipo": string,"ultimo_sello": string
            }[]
                           },
"verificar_reporte":
{ Args: { "p_reporte_id": string }; Returns: {
              "evento_roto_id": string,"evento_roto_ts": string,"integra": boolean,"motivo": string,"n_eventos": number,"trabajador_id": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"jornada": {
          Tables: {
            "dia_laboral": {
                  Row: {
                    "entrada": string | null,"estado": string,"fecha": string,"fotos_no_disponibles": number,"minutos_trabajados": number,"pausas_min": number,"recalculado_en": string,"salida": string | null,"tenant_id": string,"trabajador_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "entrada"?: string | null,"estado": string,"fecha": string,"fotos_no_disponibles"?: number,"minutos_trabajados"?: number,"pausas_min"?: number,"recalculado_en"?: string,"salida"?: string | null,"tenant_id": string,"trabajador_id": string
                  }
                  Update: {
                    "entrada"?: string | null,"estado"?: string,"fecha"?: string,"fotos_no_disponibles"?: number,"minutos_trabajados"?: number,"pausas_min"?: number,"recalculado_en"?: string,"salida"?: string | null,"tenant_id"?: string,"trabajador_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string,"hash_de_evento": string | null
                  }
                  ComputedFields: "hash_de_evento"
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2026_11": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2026_12": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_01": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_02": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_03": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_04": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_05": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_06": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_07": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_08": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_09": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_10": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"evento_2027_11": {
                  Row: {
                    "client_event_id": string | null,"creado_por": string,"dispositivo_id": string | null,"foto_estado": string | null,"foto_hash": string | null,"foto_motivo": string | null,"foto_url": string | null,"fuera_de_geocerca": boolean | null,"hash": string,"hash_prev": string | null,"hash_version": number,"id": string,"lat": number | null,"lng": number | null,"motivo": string | null,"origen": string,"precision_m": number | null,"referencia_evento_id": string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado": string | null,"ts_dispositivo": string | null,"ts_servidor": string
                  }
                  ComputedFields: never
                  Insert: {
                    "client_event_id"?: string | null,"creado_por": string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen": string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id": string,"tipo": string,"trabajador_id": string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Update: {
                    "client_event_id"?: string | null,"creado_por"?: string,"dispositivo_id"?: string | null,"foto_estado"?: string | null,"foto_hash"?: string | null,"foto_motivo"?: string | null,"foto_url"?: string | null,"fuera_de_geocerca"?: boolean | null,"hash"?: string,"hash_prev"?: string | null,"hash_version"?: number,"id"?: string,"lat"?: number | null,"lng"?: number | null,"motivo"?: string | null,"origen"?: string,"precision_m"?: number | null,"referencia_evento_id"?: string | null,"tenant_id"?: string,"tipo"?: string,"trabajador_id"?: string,"ts_declarado"?: string | null,"ts_dispositivo"?: string | null,"ts_servidor"?: string
                  }
                  Relationships: [
                    
                  ]
                },"sello_diario": {
                  Row: {
                    "fecha": string,"hash_raiz": string,"n_eventos": number,"proveedor_sello": string | null,"sellado_en": string,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fecha": string,"hash_raiz": string,"n_eventos": number,"proveedor_sello"?: string | null,"sellado_en"?: string,"tenant_id": string
                  }
                  Update: {
                    "fecha"?: string,"hash_raiz"?: string,"n_eventos"?: number,"proveedor_sello"?: string | null,"sellado_en"?: string,"tenant_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "asegurar_particiones_evento":
{ Args: { "p_meses_adelante"?: number }; Returns: undefined
                           },
"calcular_hash_evento":
{ Args: { "p_creado_por": string,"p_foto_hash": string,"p_hash_prev": string,"p_lat": number,"p_lng": number,"p_origen": string,"p_tenant_id": string,"p_tipo": string,"p_trabajador_id": string,"p_ts_dispositivo": string,"p_ts_servidor": string }; Returns: string
                           },
"calcular_hash_evento_v2":
{ Args: { "p_creado_por": string,"p_foto_hash": string,"p_hash_prev": string,"p_lat": number,"p_lng": number,"p_origen": string,"p_tenant_id": string,"p_tipo": string,"p_trabajador_id": string,"p_ts_declarado": string,"p_ts_dispositivo": string,"p_ts_servidor": string }; Returns: string
                           },
"calcular_hash_evento_v3":
{ Args: { "p_creado_por": string,"p_foto_estado": string,"p_foto_hash": string,"p_foto_motivo": string,"p_hash_prev": string,"p_lat": number,"p_lng": number,"p_origen": string,"p_tenant_id": string,"p_tipo": string,"p_trabajador_id": string,"p_ts_declarado": string,"p_ts_dispositivo": string,"p_ts_servidor": string }; Returns: string
                           },
"crear_particion_evento":
{ Args: { "p_mes": string }; Returns: string
                           },
"detalle_marcajes":
{ Args: { "p_desde": string,"p_hasta": string,"p_tenant_id": string,"p_trabajador_id": string }; Returns: {
              "anulado": boolean,"comentario_trabajador": string,"conformidad": string,"conformidad_en": string,"correccion_autorizo": string,"correccion_evento_id": string,"correccion_motivo": string,"correccion_registrada_en": string,"evento_id": string,"extemporanea": boolean,"fecha": string,"foto_estado": string,"fuera_de_geocerca": boolean,"hora_original": string,"hora_vigente": string,"incidencia_id": string,"incidencia_tipo": string,"origen": string,"solicitada_por": string,"tipo": string,"ts_servidor": string
            }[]
                           },
"distancia_m":
{ Args: { "p_lat1": number,"p_lat2": number,"p_lng1": number,"p_lng2": number }; Returns: number
                           },
"fotos_por_purgar":
{ Args: { "p_limite"?: number }; Returns: {
              "ruta": string
            }[]
                           },
"hash_de_evento":
{ Args: { "p_evento": Omit<Database["jornada"]['Tables']["evento"]['Row'], Database["jornada"]['Tables']["evento"]['ComputedFields']> }; Returns: string
                           },
"hora_efectiva":
{ Args: { "p_ts_dispositivo": string,"p_ts_servidor": string }; Returns: string
                           } |
{ Args: { "p_ts_declarado": string,"p_ts_dispositivo": string,"p_ts_servidor": string }; Returns: string
                           },
"kiosco_marcar":
{ Args: { "p_client_event_id": string,"p_foto_estado"?: string,"p_foto_hash"?: string,"p_foto_motivo"?: string,"p_pin"?: string,"p_qr"?: string,"p_token": string,"p_ts_dispositivo": string }; Returns: {
              "duplicado": boolean,"evento_id": string,"foto_url": string,"nombre": string,"tipo": string,"trabajador_id": string,"ts_servidor": string
            }[]
                           },
"marcajes_vigentes":
{ Args: { "p_desde": string,"p_hasta": string,"p_tenant_id": string,"p_trabajador_id": string }; Returns: {
              "corregido": boolean,"foto_estado": string,"hora": string,"id": string,"tipo": string
            }[]
                           },
"raiz_merkle":
{ Args: { "p_hashes": (string)[] }; Returns: string
                           },
"raiz_merkle_dia":
{ Args: { "p_fecha": string,"p_tenant_id": string }; Returns: {
              "hash_raiz": string,"n_eventos": number
            }[]
                           },
"recalcular_dia":
{ Args: { "p_fecha": string,"p_tenant_id": string,"p_trabajador_id": string }; Returns: undefined
                           },
"recalcular_rango":
{ Args: { "p_desde": string,"p_hasta": string,"p_tenant_id": string }; Returns: number
                           },
"sellar_dia":
{ Args: { "p_fecha": string,"p_tenant_id": string }; Returns: {
              "fecha": string,
"hash_raiz": string,
"n_eventos": number,
"proveedor_sello": string | null,
"sellado_en": string,
"tenant_id": string
            }
                          SetofOptions: {
        from: "*"
        to: "sello_diario"
        isOneToOne: true
        isSetofReturn: false
      } },
"sellar_dias_pendientes":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"verificar_cadena":
{ Args: { "p_desde"?: string,"p_hasta"?: string,"p_tenant_id": string,"p_trabajador_id": string }; Returns: {
              "evento_roto_id": string,"evento_roto_ts": string,"integra": boolean,"motivo": string,"n_eventos": number
            }[]
                           },
"verificar_sello":
{ Args: { "p_fecha": string,"p_tenant_id": string }; Returns: boolean
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"tenants": {
          Tables: {
            "centro_trabajo": {
                  Row: {
                    "creado_en": string,"direccion": string | null,"foto_en_kiosco": boolean,"foto_en_telefono": boolean,"id": string,"lat": number | null,"lng": number | null,"metodo_marcaje": string | null,"nombre": string,"pin_admin_hash": string | null,"radio_m": number | null,"tenant_id": string,"zona_horaria": string
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"direccion"?: string | null,"foto_en_kiosco"?: boolean,"foto_en_telefono"?: boolean,"id"?: string,"lat"?: number | null,"lng"?: number | null,"metodo_marcaje"?: string | null,"nombre": string,"pin_admin_hash"?: string | null,"radio_m"?: number | null,"tenant_id": string,"zona_horaria": string
                  }
                  Update: {
                    "creado_en"?: string,"direccion"?: string | null,"foto_en_kiosco"?: boolean,"foto_en_telefono"?: boolean,"id"?: string,"lat"?: number | null,"lng"?: number | null,"metodo_marcaje"?: string | null,"nombre"?: string,"pin_admin_hash"?: string | null,"radio_m"?: number | null,"tenant_id"?: string,"zona_horaria"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "centro_trabajo_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    }
                  ]
                },"despacho_autorizacion": {
                  Row: {
                    "autorizado_en": string,"autorizado_por": string,"despacho_id": string,"id": string,"revocado_en": string | null,"tenant_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "autorizado_en"?: string,"autorizado_por": string,"despacho_id": string,"id"?: string,"revocado_en"?: string | null,"tenant_id": string
                  }
                  Update: {
                    "autorizado_en"?: string,"autorizado_por"?: string,"despacho_id"?: string,"id"?: string,"revocado_en"?: string | null,"tenant_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "despacho_autorizacion_despacho_id_fkey"
      columns: ["despacho_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "despacho_autorizacion_tenant_id_autorizado_por_fkey"
      columns: ["tenant_id","autorizado_por"]
isOneToOne: false
      referencedRelation: "usuario"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "despacho_autorizacion_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    }
                  ]
                },"dispositivo": {
                  Row: {
                    "camara_disponible": boolean | null,"centro_id": string,"codigo_enlace_hash": string | null,"codigo_expira_en": string | null,"creado_en": string,"creado_por": string | null,"id": string,"nombre": string,"revocado_en": string | null,"tenant_id": string,"token_hash": string | null,"ultimo_uso": string | null,"usuario_id": string,"vinculado_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "camara_disponible"?: boolean | null,"centro_id": string,"codigo_enlace_hash"?: string | null,"codigo_expira_en"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre"?: string,"revocado_en"?: string | null,"tenant_id": string,"token_hash"?: string | null,"ultimo_uso"?: string | null,"usuario_id": string,"vinculado_en"?: string | null
                  }
                  Update: {
                    "camara_disponible"?: boolean | null,"centro_id"?: string,"codigo_enlace_hash"?: string | null,"codigo_expira_en"?: string | null,"creado_en"?: string,"creado_por"?: string | null,"id"?: string,"nombre"?: string,"revocado_en"?: string | null,"tenant_id"?: string,"token_hash"?: string | null,"ultimo_uso"?: string | null,"usuario_id"?: string,"vinculado_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "dispositivo_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "usuario"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispositivo_tenant_id_centro_id_fkey"
      columns: ["tenant_id","centro_id"]
isOneToOne: false
      referencedRelation: "centro_trabajo"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "dispositivo_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "dispositivo_usuario_id_fkey"
      columns: ["usuario_id"]
isOneToOne: false
      referencedRelation: "usuario"
      referencedColumns: ["id"]
    }
                  ]
                },"empresa": {
                  Row: {
                    "correo_privacidad": string | null,"creado_en": string,"domicilio": string | null,"es_despacho": boolean,"estado": string,"id": string,"jurisdiccion": string,"logo_url": string | null,"onboarding_completado_en": string | null,"plan": string,"razon_social": string,"rfc": string | null,"sector": string | null,"tamano": string,"telefono_privacidad": string | null,"zona_horaria": string
                  }
                  ComputedFields: never
                  Insert: {
                    "correo_privacidad"?: string | null,"creado_en"?: string,"domicilio"?: string | null,"es_despacho"?: boolean,"estado"?: string,"id"?: string,"jurisdiccion": string,"logo_url"?: string | null,"onboarding_completado_en"?: string | null,"plan"?: string,"razon_social": string,"rfc"?: string | null,"sector"?: string | null,"tamano": string,"telefono_privacidad"?: string | null,"zona_horaria"?: string
                  }
                  Update: {
                    "correo_privacidad"?: string | null,"creado_en"?: string,"domicilio"?: string | null,"es_despacho"?: boolean,"estado"?: string,"id"?: string,"jurisdiccion"?: string,"logo_url"?: string | null,"onboarding_completado_en"?: string | null,"plan"?: string,"razon_social"?: string,"rfc"?: string | null,"sector"?: string | null,"tamano"?: string,"telefono_privacidad"?: string | null,"zona_horaria"?: string
                  }
                  Relationships: [
                    
                  ]
                },"horario": {
                  Row: {
                    "creado_en": string,"descanso_semanal": (number)[],"dias": NonNullable<Json>,"hora_entrada": string,"hora_salida": string,"id": string,"tenant_id": string,"trabajador_id": string,"vigente_desde": string,"vigente_hasta": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"descanso_semanal"?: (number)[],"dias": NonNullable<Json>,"hora_entrada": string,"hora_salida": string,"id"?: string,"tenant_id": string,"trabajador_id": string,"vigente_desde": string,"vigente_hasta"?: string | null
                  }
                  Update: {
                    "creado_en"?: string,"descanso_semanal"?: (number)[],"dias"?: NonNullable<Json>,"hora_entrada"?: string,"hora_salida"?: string,"id"?: string,"tenant_id"?: string,"trabajador_id"?: string,"vigente_desde"?: string,"vigente_hasta"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "horario_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "horario_tenant_id_trabajador_id_fkey"
      columns: ["tenant_id","trabajador_id"]
isOneToOne: false
      referencedRelation: "trabajador"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"intento_pin": {
                  Row: {
                    "bloqueado_hasta": string | null,"fallidos": number,"trabajador_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bloqueado_hasta"?: string | null,"fallidos"?: number,"trabajador_id": string
                  }
                  Update: {
                    "bloqueado_hasta"?: string | null,"fallidos"?: number,"trabajador_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "intento_pin_trabajador_id_fkey"
      columns: ["trabajador_id"]
isOneToOne: true
      referencedRelation: "trabajador"
      referencedColumns: ["id"]
    }
                  ]
                },"invitacion": {
                  Row: {
                    "creado_en": string,"creado_por": string | null,"expira_en": string,"id": string,"tenant_id": string,"token_hash": string,"trabajador_id": string,"usada_en": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "creado_en"?: string,"creado_por"?: string | null,"expira_en"?: string,"id"?: string,"tenant_id": string,"token_hash": string,"trabajador_id": string,"usada_en"?: string | null
                  }
                  Update: {
                    "creado_en"?: string,"creado_por"?: string | null,"expira_en"?: string,"id"?: string,"tenant_id"?: string,"token_hash"?: string,"trabajador_id"?: string,"usada_en"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitacion_creado_por_fkey"
      columns: ["creado_por"]
isOneToOne: false
      referencedRelation: "usuario"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitacion_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitacion_tenant_id_trabajador_id_fkey"
      columns: ["tenant_id","trabajador_id"]
isOneToOne: false
      referencedRelation: "trabajador"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                },"limite_api": {
                  Row: {
                    "peticiones": number,"tenant_id": string,"ventana": string
                  }
                  ComputedFields: never
                  Insert: {
                    "peticiones"?: number,"tenant_id": string,"ventana": string
                  }
                  Update: {
                    "peticiones"?: number,"tenant_id"?: string,"ventana"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "limite_api_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    }
                  ]
                },"trabajador": {
                  Row: {
                    "centro_id": string,"creado_en": string,"curp_cifrado": string | null,"fecha_alta": string,"fecha_baja": string | null,"id": string,"menor_de_edad": boolean,"metodo_marcaje": string,"nombre": string,"nss_cifrado": string | null,"pin_hash": string | null,"puesto": string | null,"qr_token_hash": string | null,"tenant_id": string,"tipo_jornada": string
                  }
                  ComputedFields: never
                  Insert: {
                    "centro_id": string,"creado_en"?: string,"curp_cifrado"?: string | null,"fecha_alta"?: string,"fecha_baja"?: string | null,"id"?: string,"menor_de_edad"?: boolean,"metodo_marcaje"?: string,"nombre": string,"nss_cifrado"?: string | null,"pin_hash"?: string | null,"puesto"?: string | null,"qr_token_hash"?: string | null,"tenant_id": string,"tipo_jornada"?: string
                  }
                  Update: {
                    "centro_id"?: string,"creado_en"?: string,"curp_cifrado"?: string | null,"fecha_alta"?: string,"fecha_baja"?: string | null,"id"?: string,"menor_de_edad"?: boolean,"metodo_marcaje"?: string,"nombre"?: string,"nss_cifrado"?: string | null,"pin_hash"?: string | null,"puesto"?: string | null,"qr_token_hash"?: string | null,"tenant_id"?: string,"tipo_jornada"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trabajador_tenant_id_centro_id_fkey"
      columns: ["tenant_id","centro_id"]
isOneToOne: false
      referencedRelation: "centro_trabajo"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "trabajador_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    }
                  ]
                },"usuario": {
                  Row: {
                    "activo": boolean,"auth_user_id": string | null,"centro_id": string | null,"creado_en": string,"id": string,"nombre": string | null,"rol": string,"tenant_id": string,"trabajador_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "activo"?: boolean,"auth_user_id"?: string | null,"centro_id"?: string | null,"creado_en"?: string,"id"?: string,"nombre"?: string | null,"rol": string,"tenant_id": string,"trabajador_id"?: string | null
                  }
                  Update: {
                    "activo"?: boolean,"auth_user_id"?: string | null,"centro_id"?: string | null,"creado_en"?: string,"id"?: string,"nombre"?: string | null,"rol"?: string,"tenant_id"?: string,"trabajador_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "usuario_tenant_id_centro_id_fkey"
      columns: ["tenant_id","centro_id"]
isOneToOne: false
      referencedRelation: "centro_trabajo"
      referencedColumns: ["tenant_id","id"]
    },{
      foreignKeyName: "usuario_tenant_id_fkey"
      columns: ["tenant_id"]
isOneToOne: false
      referencedRelation: "empresa"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "usuario_tenant_id_trabajador_id_fkey"
      columns: ["tenant_id","trabajador_id"]
isOneToOne: false
      referencedRelation: "trabajador"
      referencedColumns: ["tenant_id","id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "aceptar_invitacion":
{ Args: { "p_auth_user_id": string,"p_pin": string,"p_token": string }; Returns: string
                           },
"centro_de_trabajador":
{ Args: { "p_trabajador_id": string }; Returns: string
                           },
"cifrar":
{ Args: { "p_tenant_id": string,"p_texto": string }; Returns: string
                           },
"claims_token_acceso":
{ Args: { "event": Json }; Returns: Json
                           },
"consumir_limite_api":
{ Args: { "p_max"?: number,"p_ventana_seg"?: number }; Returns: boolean
                           },
"crear_empresa":
{ Args: { "jurisdiccion_sugerida": string,"razon_social": string,"rfc": string,"sector": string,"tamano": string }; Returns: string
                           },
"crear_horario":
{ Args: { "descanso_semanal"?: (number)[],"dias": Json,"hora_entrada": string,"hora_salida": string,"trabajador_id": string,"vigente_desde": string }; Returns: string
                           },
"crear_invitacion":
{ Args: { "trabajador_id": string }; Returns: string
                           },
"crear_trabajador":
{ Args: { "centro_id": string,"curp"?: string,"descanso_semanal"?: (number)[],"dias"?: Json,"hora_entrada"?: string,"hora_salida"?: string,"menor_de_edad"?: boolean,"nombre": string,"nss"?: string,"puesto"?: string,"tipo_jornada"?: string }; Returns: {
              "id": string,"pin": string,"qr_token": string
            }[]
                           },
"cuenta_de_empleado":
{ Args: { "p_correo": string }; Returns: string
                           },
"descifrar":
{ Args: { "p_dato": string,"p_tenant_id": string }; Returns: string
                           },
"desvincular_dispositivo":
{ Args: { "p_pin_admin": string,"p_token": string }; Returns: boolean
                           },
"dispositivo_por_token":
{ Args: { "p_token": string }; Returns: {
              "camara_disponible": boolean | null,
"centro_id": string,
"codigo_enlace_hash": string | null,
"codigo_expira_en": string | null,
"creado_en": string,
"creado_por": string | null,
"id": string,
"nombre": string,
"revocado_en": string | null,
"tenant_id": string,
"token_hash": string | null,
"ultimo_uso": string | null,
"usuario_id": string,
"vinculado_en": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "dispositivo"
        isOneToOne: true
        isSetofReturn: false
      } },
"es_admin_de":
{ Args: { "p_tenant_id": string }; Returns: boolean
                           },
"es_dueno_de":
{ Args: { "p_tenant_id": string }; Returns: boolean
                           },
"es_supervisor_de_centro":
{ Args: { "p_centro_id": string,"p_tenant_id": string }; Returns: boolean
                           },
"generar_codigo_enlace":
{ Args: { "centro_id": string,"nombre"?: string }; Returns: string
                           },
"generar_pin":
{ Args: { "p_centro_id": string }; Returns: string
                           },
"generar_pin_admin":
{ Args: { "centro_id": string }; Returns: string
                           },
"generar_token":
{ Args: { "p_bytes"?: number }; Returns: string
                           },
"hash_token":
{ Args: { "p_token": string }; Returns: string
                           },
"invitacion_info":
{ Args: { "p_token": string }; Returns: {
              "empresa": string,"nombre": string
            }[]
                           },
"jwt_centro_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"jwt_rol":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"jwt_tenant_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"jwt_trabajador_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"jwt_usuario_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"kiosco_estado":
{ Args: { "p_token": string }; Returns: {
              "centro": string,"empresa": string,"foto": boolean,"zona_horaria": string
            }[]
                           },
"llave_cifrado":
{ Args: { "p_tenant_id": string }; Returns: string
                           },
"nombre_de_usuario":
{ Args: { "p_usuario_id": string }; Returns: string
                           },
"puede_ver_trabajador":
{ Args: { "p_tenant_id": string,"p_trabajador_id": string }; Returns: boolean
                           },
"regenerar_credenciales":
{ Args: { "trabajador_id": string }; Returns: {
              "pin": string,"qr_token": string
            }[]
                           },
"tenant_autorizado":
{ Args: { "p_tenant_id": string }; Returns: boolean
                           },
"trabajador_por_credencial":
{ Args: { "p_centro_id": string,"p_pin": string,"p_qr": string }; Returns: {
              "centro_id": string,
"creado_en": string,
"curp_cifrado": string | null,
"fecha_alta": string,
"fecha_baja": string | null,
"id": string,
"menor_de_edad": boolean,
"metodo_marcaje": string,
"nombre": string,
"nss_cifrado": string | null,
"pin_hash": string | null,
"puesto": string | null,
"qr_token_hash": string | null,
"tenant_id": string,
"tipo_jornada": string
            }
                          SetofOptions: {
        from: "*"
        to: "trabajador"
        isOneToOne: true
        isSetofReturn: false
      } },
"verificar_pin":
{ Args: { "p_pin": string,"p_trabajador_id": string }; Returns: boolean
                           },
"verificar_pin_de_cuenta":
{ Args: { "p_auth_user_id": string,"p_pin": string }; Returns: boolean
                           },
"vincular_dispositivo":
{ Args: { "p_codigo": string }; Returns: {
              "centro": string,"empresa": string,"foto": boolean,"token": string,"zona_horaria": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "calculo">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "calculo": {
          Enums: {
            
          }
        },"cumplimiento": {
          Enums: {
            
          }
        },"jornada": {
          Enums: {
            
          }
        },"tenants": {
          Enums: {
            
          }
        }
} as const
